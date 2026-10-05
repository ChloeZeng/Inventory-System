"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
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

// "Complete missing info" on the lot page: receipt-level and lot-level fields that
// can be filled in after receiving. Every change goes to the AuditLog; changing a
// value that was already recorded needs a reason.
export async function updateLotDetails(lotId: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const lot = await prisma.lot.findUniqueOrThrow({ where: { id: lotId }, include: { receipt: true } });
    const fieldErrors: Record<string, string> = {};

    const qtyMatches = str(formData, "qtyMatchesPackingList");
    const receiptAfter = {
      poInvoiceNo: str(formData, "poInvoiceNo"),
      trackingNo: str(formData, "trackingNo"),
      carrierInspectionDone: bool(formData, "carrierInspectionDone"),
      qtyMatchesPackingList: qtyMatches === "yes" ? true : qtyMatches === "no" ? false : null,
      qtyMatchNote: str(formData, "qtyMatchNote"),
      segregation: str(formData, "segregation") ?? "",
      quarantineStickerApplied: bool(formData, "quarantineStickerApplied"),
    };
    if (!SEGREGATION.some((s) => s.value === receiptAfter.segregation)) fieldErrors.segregation = "Pick a segregation option.";
    if (receiptAfter.qtyMatchesPackingList === false && !receiptAfter.qtyMatchNote)
      fieldErrors.qtyMatchNote = "Describe the shortage or difference.";

    const unitCost = decimal(formData, "unitCost");
    if (unitCost === "invalid") fieldErrors.unitCost = "Enter a number, e.g. 0.0125";
    const lotAfter = {
      supplierBatchNo: str(formData, "supplierBatchNo"),
      lotNo: str(formData, "lotNo"),
      mfgDate: dateOnly(formData, "mfgDate"),
      expDate: dateOnly(formData, "expDate"),
      unitCost: unitCost && unitCost !== "invalid" ? new Prisma.Decimal(unitCost).toString() : null,
      locationId: Number(formData.get("locationId")),
    };
    if (!lotAfter.supplierBatchNo && !lotAfter.lotNo) fieldErrors.supplierBatchNo = "Keep at least the batch no. or the lot no.";
    if (lotAfter.mfgDate && lotAfter.expDate && lotAfter.expDate <= lotAfter.mfgDate) fieldErrors.expDate = "Exp date must be after mfg date.";
    if (!(await prisma.location.findUnique({ where: { id: lotAfter.locationId } }))) fieldErrors.locationId = "Pick a location.";

    const receiptBefore = lot.receipt;
    const lotBefore = { ...lot, unitCost: lot.unitCost?.toString() ?? null };
    const corrected = [
      ...Object.keys(receiptAfter).filter(
        (k) => !same(receiptBefore[k as keyof typeof receiptAfter], receiptAfter[k as keyof typeof receiptAfter]) && !wasBlank(k, receiptBefore[k as keyof typeof receiptAfter]),
      ),
      ...Object.keys(lotAfter).filter(
        (k) => !same(lotBefore[k as keyof typeof lotAfter], lotAfter[k as keyof typeof lotAfter]) && !wasBlank(k, lotBefore[k as keyof typeof lotAfter]),
      ),
    ];
    const reason = str(formData, "reason");
    if (corrected.length && !reason)
      fieldErrors.reason = `You changed a value that was already recorded (${corrected.map((k) => LABELS[k] ?? k).join(", ")}) — give a reason.`;
    if (Object.keys(fieldErrors).length) return { error: "Please fix the highlighted fields.", fieldErrors };

    // A QC sign-off covers one specific answer and note. If either changes, it no longer applies.
    const qtyDiffChanged =
      !same(receiptBefore.qtyMatchesPackingList, receiptAfter.qtyMatchesPackingList) ||
      !same(receiptBefore.qtyMatchNote, receiptAfter.qtyMatchNote);
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

// Only QC (or admin) may accept a total that does not match the packing list / PO.
const QC_ROLES = ["qc", "admin"];

export async function resolveQtyDifference(lotId: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    if (!QC_ROLES.includes(user.role)) return { error: "Only QC can resolve a quantity difference." };
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
