"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireQcAuthorized, requireUser } from "@/lib/current-user";
import { releaseReadiness } from "@/lib/completeness";
import { LOT_INCLUDE, lotStatus } from "@/lib/records";
import { refreshLotWorkflow } from "@/lib/workflow";
import { parseCategoryConfig } from "@/lib/category-config";
import { confirmErrors, defectCounts, readInspectionForm } from "@/lib/inspection";
import { calculatedDisposition, loadAnsiTables, samplingPlan } from "@/lib/sampling";
import { auditCreate, auditUpdate } from "@/lib/audit";
import { createDocument } from "@/lib/documents";
import { fileFromForm, saveUpload } from "@/lib/uploads";
import { LOT_DOCUMENT_TYPES, RECEIPT_DOCUMENT_TYPES, SEGREGATION, USAGE_TYPES } from "@/lib/constants";
import { type ActionState, bool, dateOnly, decimal, errorMessage, int, str, toDateInput, todayDateInput } from "@/lib/forms";

const LABELS: Record<string, string> = {
  poInvoiceNo: "PO / invoice no.",
  trackingNo: "Tracking no.",
  carrierInspectionDone: "Truck inspected",
  qtyMatchesPackingList: "Total matches packing list",
  qtyMatchNote: "Packing list note",
  segregation: "Segregation",
  quarantineStickerApplied: "Quarantine sticker",
  supplierBatchNo: "Supplier batch no.",
  lotNo: "Lot no.",
  mfgDate: "Mfg date",
  expDate: "Exp date",
  unitCost: "Unit cost",
  locationId: "Location",
};

// Filling in something that was blank is not a correction; changing a recorded value is.
// (A yes/no checkbox left unticked counts as blank; an answered "No" does not.)
const wasBlank = (k: string, v: unknown) =>
  v === null || v === undefined || v === "" || (v === false && k !== "qtyMatchesPackingList");
const same = (a: unknown, b: unknown) =>
  (a instanceof Date ? a.toISOString() : String(a ?? "")) === (b instanceof Date ? b.toISOString() : String(b ?? ""));

// Lot details on the lot page: receipt-level and lot-level fields that can be
// filled in after receiving. Used by the full Details form and by the one-field
// "Fix" modals: a form that sends `_fields` saves only those fields (a checkbox
// that is absent then means "No"); without `_fields` every field is saved.
// Every change goes to the AuditLog; changing a value that was already recorded needs a reason.
export async function updateLotDetails(lotId: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const lot = await prisma.lot.findUniqueOrThrow({ where: { id: lotId }, include: { receipt: true } });
    const fieldErrors: Record<string, string> = {};
    const only = formData.getAll("_fields").map(String);
    const sends = (k: string) => only.length === 0 || only.includes(k);
    const pick = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).filter(([k]) => sends(k))) as Partial<T>;

    const qtyMatches = str(formData, "qtyMatchesPackingList");
    const receiptAfter = pick({
      poInvoiceNo: str(formData, "poInvoiceNo"),
      trackingNo: str(formData, "trackingNo"),
      carrierInspectionDone: bool(formData, "carrierInspectionDone"),
      qtyMatchesPackingList: qtyMatches === "yes" ? true : qtyMatches === "no" ? false : null,
      qtyMatchNote: str(formData, "qtyMatchNote"),
      segregation: str(formData, "segregation") ?? "",
      quarantineStickerApplied: bool(formData, "quarantineStickerApplied"),
    });
    const unitCost = sends("unitCost") ? decimal(formData, "unitCost") : null;
    if (unitCost === "invalid") fieldErrors.unitCost = "Enter a number, e.g. 0.0125";
    const lotAfter = pick({
      supplierBatchNo: str(formData, "supplierBatchNo"),
      lotNo: str(formData, "lotNo"),
      mfgDate: dateOnly(formData, "mfgDate"),
      expDate: dateOnly(formData, "expDate"),
      unitCost: unitCost && unitCost !== "invalid" ? new Prisma.Decimal(unitCost).toString() : null,
      locationId: Number(formData.get("locationId")),
    });

    const receiptBefore = lot.receipt;
    const lotBefore = { ...lot, unitCost: lot.unitCost?.toString() ?? null };
    // what the records will look like after this save, for rules across fields
    const receiptNext = { ...receiptBefore, ...receiptAfter };
    const lotNext = { ...lotBefore, ...lotAfter };

    if ("segregation" in receiptAfter && !SEGREGATION.some((s) => s.value === receiptNext.segregation))
      fieldErrors.segregation = "Pick a segregation option.";
    if (receiptNext.qtyMatchesPackingList === false && !receiptNext.qtyMatchNote)
      fieldErrors.qtyMatchNote = "Describe the shortage or difference.";
    if (!lotNext.supplierBatchNo && !lotNext.lotNo) fieldErrors.supplierBatchNo = "Keep at least the batch no. or the lot no.";
    if (lotNext.mfgDate && lotNext.expDate && lotNext.expDate <= lotNext.mfgDate) fieldErrors.expDate = "Exp date must be after mfg date.";
    if ("locationId" in lotAfter && !(await prisma.location.findUnique({ where: { id: lotNext.locationId } })))
      fieldErrors.locationId = "Pick a location.";

    const changedFrom = (before: Record<string, unknown>, after: Record<string, unknown>) =>
      Object.keys(after).filter((k) => !same(before[k], after[k]) && !wasBlank(k, before[k]));
    const corrected = [...changedFrom(receiptBefore, receiptAfter), ...changedFrom(lotBefore, lotAfter)];
    const reason = str(formData, "reason");
    if (corrected.length && !reason)
      fieldErrors.reason = `You changed a value that was already recorded (${corrected.map((k) => LABELS[k] ?? k).join(", ")}) — give a reason.`;
    if (Object.keys(fieldErrors).length) return { error: "Please fix the highlighted fields.", fieldErrors };

    // A QC sign-off covers one specific answer and note. If either changes, it no longer applies.
    const qtyDiffChanged =
      !same(receiptBefore.qtyMatchesPackingList, receiptNext.qtyMatchesPackingList) || !same(receiptBefore.qtyMatchNote, receiptNext.qtyMatchNote);
    const receiptData =
      qtyDiffChanged && receiptBefore.qtyDiffResolution
        ? { ...receiptAfter, qtyDiffResolution: null, qtyDiffResolvedById: null, qtyDiffResolvedAt: null }
        : receiptAfter;

    const changed = await prisma.$transaction(async (tx) => {
      const r = await auditUpdate(tx, {
        userId: user.id,
        table: "Receipt",
        recordId: lot.receiptId,
        before: receiptBefore,
        after: receiptData,
        reason: reason ?? undefined,
      });
      if (r) await tx.receipt.update({ where: { id: lot.receiptId }, data: receiptData });
      const l = await auditUpdate(tx, {
        userId: user.id,
        table: "Lot",
        recordId: lot.id,
        before: lotBefore,
        after: lotAfter,
        reason: reason ?? undefined,
      });
      if (l) await tx.lot.update({ where: { id: lot.id }, data: lotAfter });
      // receipt fields are shared by every lot on the delivery
      if (r || l) await refreshLotWorkflow(tx, { receiptId: lot.receiptId });
      return r + l;
    });
    revalidatePath("/", "layout");
    return { ok: changed ? `Saved ${changed} change${changed > 1 ? "s" : ""}.` : "No changes." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

// Only a QC-authorized user may accept a total that does not match the packing list / PO.
export async function resolveQtyDifference(lotId: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireQcAuthorized();
    const lot = await prisma.lot.findUniqueOrThrow({ where: { id: lotId }, include: { receipt: true } });
    if (lot.receipt.qtyMatchesPackingList !== false)
      return { error: "Nothing to resolve: the total is not recorded as different from the packing list / PO." };
    if (lot.receipt.qtyDiffResolution) return { error: "This difference is already resolved." };
    const resolution = str(formData, "resolution");
    if (!resolution)
      return { error: "Write how the difference was resolved.", fieldErrors: { resolution: "Required — e.g. supplier credit note, PO adjusted." } };

    const after = { qtyDiffResolution: resolution, qtyDiffResolvedById: user.id, qtyDiffResolvedAt: new Date() };
    await prisma.$transaction(async (tx) => {
      await auditUpdate(tx, {
        userId: user.id,
        table: "Receipt",
        recordId: lot.receiptId,
        before: lot.receipt,
        after,
        reason: "Quantity difference resolved by QC",
      });
      await tx.receipt.update({ where: { id: lot.receiptId }, data: after });
      await refreshLotWorkflow(tx, { receiptId: lot.receiptId });
    });
    revalidatePath("/", "layout");
    return { ok: "Difference resolved." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

// Release (spec §4.4): QC-authorized only; blocked while any requirement is open
// (the same releaseReadiness the Release panel shows); release sticker confirmed.
export async function releaseLot(lotId: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireQcAuthorized();
    const lot = await prisma.lot.findUniqueOrThrow({ where: { id: lotId }, include: LOT_INCLUDE });
    if (lot.qcStatus !== "Quarantine") return { error: `This lot is already ${lot.qcStatus.toLowerCase()}.` };
    const readiness = releaseReadiness(lotStatus(lot).summary);
    if (!readiness.ready)
      return { error: `Cannot release yet — ${readiness.open.length} open: ${readiness.open.map((r) => r.req.label).join(", ")}.` };
    if (!bool(formData, "releaseStickerPlaced"))
      return { error: "Confirm the release sticker is placed over the quarantine sticker.", fieldErrors: { releaseStickerPlaced: "Required." } };

    const after = { qcStatus: "Released", releaseStickerPlaced: true, releasedAt: new Date(), releasedById: user.id };
    await prisma.$transaction(async (tx) => {
      await auditUpdate(tx, {
        userId: user.id,
        table: "Lot",
        recordId: lot.id,
        before: lot,
        after,
        reason: str(formData, "comment") ?? "Released by QC — all requirements met",
      });
      await tx.lot.update({ where: { id: lot.id }, data: after });
      await refreshLotWorkflow(tx, { id: lot.id });
    });
    revalidatePath("/", "layout");
    return { ok: "Lot released." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

// Reject: QC-authorized only, from Quarantine, with a written reason.
export async function rejectLot(lotId: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireQcAuthorized();
    const lot = await prisma.lot.findUniqueOrThrow({ where: { id: lotId } });
    if (lot.qcStatus !== "Quarantine") return { error: `This lot is already ${lot.qcStatus.toLowerCase()}.` };
    const reason = str(formData, "reason");
    if (!reason) return { error: "Give the reason for rejecting.", fieldErrors: { reason: "Required." } };

    const after = { qcStatus: "Rejected", rejectedAt: new Date(), rejectedById: user.id, rejectionReason: reason };
    await prisma.$transaction(async (tx) => {
      await auditUpdate(tx, { userId: user.id, table: "Lot", recordId: lot.id, before: lot, after, reason });
      await tx.lot.update({ where: { id: lot.id }, data: after });
      await refreshLotWorkflow(tx, { id: lot.id });
    });
    revalidatePath("/", "layout");
    return { ok: "Lot rejected." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function uploadLotDocument(lotId: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const lot = await prisma.lot.findUniqueOrThrow({ where: { id: lotId }, include: { receipt: true } });
    const file = fileFromForm(formData, "file");
    if (!file) return { error: "Choose a file." };
    const type = str(formData, "type") ?? "";
    if (!(LOT_DOCUMENT_TYPES as readonly string[]).includes(type)) return { error: "Unknown document type." };

    const onReceipt = RECEIPT_DOCUMENT_TYPES.includes(type);
    const saved = await saveUpload(file, onReceipt ? "receipts" : "lots");
    await prisma.$transaction(async (tx) => {
      await createDocument(tx, user.id, saved, type, onReceipt ? { receiptId: lot.receiptId } : { lotId });
      await refreshLotWorkflow(tx, onReceipt ? { receiptId: lot.receiptId } : { id: lotId });
    });
    revalidatePath("/", "layout");
    return { ok: `Uploaded ${file.name}${onReceipt ? ` to ${lot.receipt.receivingNo}` : ""}.` };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

// ---- F.WD.003 inspection (spec §4.3) ---------------------------------------------------------
// "draft": anyone may save results; nothing counts until confirmed.
// "confirm": QC-authorized only; complete results and an explicit disposition. The plan's
// calculated result is a suggestion — choosing otherwise needs a written reason.
export async function saveInspection(lotId: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const intent = formData.get("intent") === "confirm" ? "confirm" : "draft";
    const user = intent === "confirm" ? await requireQcAuthorized() : await requireUser();
    const lot = await prisma.lot.findUniqueOrThrow({
      where: { id: lotId },
      include: { item: { include: { category: true } }, inspections: true },
    });
    if (lot.qcStatus !== "Quarantine") return { error: `This lot is already ${lot.qcStatus.toLowerCase()}.` };
    if (lot.inspections.some((i) => i.status === "final")) return { error: "An inspection is already confirmed for this lot." };

    const questions = parseCategoryConfig(lot.item.category.config).inspectionChecklist;
    const { values, fieldErrors } = readInspectionForm(formData, questions);

    let plan: ReturnType<typeof samplingPlan> | null = null;
    if (lot.item.category.testPath === "ansi_sampling") {
      try {
        plan = samplingPlan(await loadAnsiTables(prisma), lot.qtyReceived);
      } catch {
        plan = null; // tables incomplete: no calculated suggestion
      }
    }
    const calculated = plan ? calculatedDisposition(plan.classes, defectCounts(values)) : null;
    const disposition = str(formData, "disposition");
    const overrideReason = str(formData, "overrideReason");
    if (intent === "confirm")
      Object.assign(fieldErrors, confirmErrors(values, questions, { lotSize: lot.qtyReceived, disposition, calculated, overrideReason }));
    if (Object.keys(fieldErrors).length)
      return { error: intent === "confirm" ? "The inspection cannot be confirmed yet — fix the highlighted answers." : "Fix the highlighted fields.", fieldErrors };

    const data = {
      status: intent === "confirm" ? "final" : "draft",
      lotSize: lot.qtyReceived,
      codeLetter: plan?.codeLetter ?? null,
      plan: JSON.stringify(plan?.classes ?? []),
      sampleSize: plan?.sampleSize ?? null,
      casesSampled: values.casesSampled,
      itemsSampled: values.itemsSampled,
      checklist: JSON.stringify(values.checklist),
      criticalDefects: values.defects.critical ?? 0,
      majorDefects: values.defects.major ?? 0,
      minorDefects: values.defects.minor ?? 0,
      defectNotes: values.defectNotes,
      comments: values.comments,
      calculatedDisposition: calculated,
      disposition: intent === "confirm" ? disposition : null,
      overrideReason: intent === "confirm" && disposition !== calculated ? overrideReason : null,
      inspectedById: user.id,
      inspectedAt: new Date(),
      ...(intent === "confirm" ? { confirmedById: user.id, confirmedAt: new Date() } : {}),
    };
    // the plan snapshot is derived from the lot size; the time is in the log itself
    const audited: Record<string, unknown> = { ...data };
    delete audited.plan;
    delete audited.inspectedAt;
    const draft = lot.inspections.find((i) => i.status === "draft");
    const reason = intent === "confirm" ? (data.overrideReason ?? "QC confirmed the inspection disposition") : undefined;

    await prisma.$transaction(async (tx) => {
      if (draft) {
        await auditUpdate(tx, { userId: user.id, table: "Inspection", recordId: draft.id, before: draft, after: audited, reason });
        await tx.inspection.update({ where: { id: draft.id }, data });
      } else {
        const created = await tx.inspection.create({ data: { ...data, lotId } });
        await auditCreate(tx, { userId: user.id, table: "Inspection", recordId: created.id, values: { lotId, ...audited }, reason });
      }
      await refreshLotWorkflow(tx, { id: lotId });
    });
    revalidatePath("/", "layout");
    return { ok: intent === "confirm" ? `Inspection confirmed: ${disposition}.` : "Draft saved. It does not count until QC confirms it." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

// ---- Usage entry (spec §4.5) -------------------------------------------------------------------
// Takes stock out of a released lot. The balance is recalculated from the ledger inside the
// transaction and the quantity may not exceed it. A form's clientRequestId makes a repeated
// submission record the usage only once.
export async function recordUsage(lotId: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const fieldErrors: Record<string, string> = {};
    const type = str(formData, "type") ?? "";
    if (!(USAGE_TYPES as readonly string[]).includes(type)) fieldErrors.type = "Pick what the stock was used for.";
    const qty = int(formData, "qty", 1);
    if (!qty) fieldErrors.qty = "Enter a whole number of units (1 or more).";
    const date = dateOnly(formData, "date");
    if (!date) fieldErrors.date = "Enter the date of use.";
    else if (toDateInput(date) > todayDateInput()) fieldErrors.date = "The date cannot be in the future.";
    const productOrCustomer = str(formData, "productOrCustomer");
    if (!productOrCustomer) fieldErrors.productOrCustomer = "Enter the product, customer or reference.";
    const roomId = Number(formData.get("roomId")) || null;
    const clientRequestId = str(formData, "clientRequestId");
    if (!clientRequestId) return { error: "The form is out of date — reload the page and try again." };
    if (Object.keys(fieldErrors).length) return { error: "Please fix the highlighted fields.", fieldErrors };

    const result = await prisma.$transaction(async (tx) => {
      if (await tx.inventoryTransaction.findUnique({ where: { clientRequestId } })) return { duplicate: true as const };
      const lot = await tx.lot.findUniqueOrThrow({ where: { id: lotId }, include: { transactions: { select: { qty: true } } } });
      if (lot.qcStatus !== "Released") throw new Error("Only released lots can be used.");
      if (roomId && !(await tx.room.findFirst({ where: { id: roomId, locationId: lot.locationId } }))) throw new Error("Pick a room at the lot's location.");
      const balance = lot.transactions.reduce((s, t) => s + t.qty, 0);
      if (qty! > balance) return { overdraw: balance };

      const values = {
        lotId,
        type,
        qty: -qty!,
        roomId,
        productOrCustomer,
        date: date!,
        operatorId: user.id,
        notes: str(formData, "notes"),
        clientRequestId,
      };
      const txn = await tx.inventoryTransaction.create({ data: values });
      const audited: Record<string, unknown> = { ...values };
      delete audited.clientRequestId;
      await auditCreate(tx, { userId: user.id, table: "InventoryTransaction", recordId: txn.id, values: audited });
      await refreshLotWorkflow(tx, { id: lotId });
      return { balance: balance - qty! };
    });

    if ("overdraw" in result)
      return { error: "Not enough stock.", fieldErrors: { qty: `Only ${result.overdraw!.toLocaleString()} units on hand.` } };
    revalidatePath("/", "layout");
    if ("duplicate" in result) return { ok: "This usage was already recorded." };
    return { ok: `Usage recorded. ${result.balance.toLocaleString()} units left.` };
  } catch (e) {
    // two submissions of the same form racing: the unique clientRequestId lets only one in
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: "This usage was already recorded." };
    return { error: errorMessage(e) };
  }
}
