"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireQcAuthorized, requireUser } from "@/lib/current-user";
import { releaseReadiness } from "@/lib/completeness";
import { LOT_INCLUDE, lotStatus } from "@/lib/records";
import { auditUpdate } from "@/lib/audit";
import { createDocument } from "@/lib/documents";
import { fileFromForm, saveUpload } from "@/lib/uploads";
import { LOT_DOCUMENT_TYPES, RECEIPT_DOCUMENT_TYPES, SEGREGATION } from "@/lib/constants";
import { type ActionState, bool, dateOnly, decimal, errorMessage, str } from "@/lib/forms";

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
    await prisma.$transaction((tx) => createDocument(tx, user.id, saved, type, onReceipt ? { receiptId: lot.receiptId } : { lotId }));
    revalidatePath("/", "layout");
    return { ok: `Uploaded ${file.name}${onReceipt ? ` to ${lot.receipt.receivingNo}` : ""}.` };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
