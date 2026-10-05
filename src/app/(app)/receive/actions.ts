"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { parseCategoryConfig, parseSpecs, sameSpecs } from "@/lib/category-config";
import { evaluate } from "@/lib/completeness";
import { nextItemCode, nextReceivingNo } from "@/lib/numbering";
import { auditCreate } from "@/lib/audit";
import { createDocument } from "@/lib/documents";
import { fileFromForm, saveUpload } from "@/lib/uploads";
import { SEGREGATION, SUPPLIER_TYPES } from "@/lib/constants";
import { type ActionState, dateOnly, decimal, errorMessage, int, str, toDateInput, todayDateInput } from "@/lib/forms";

// Receiving wizard (spec §4.1). Creates, in one transaction:
// the item (only if it is a new item type), the receipt (REC-YYYY-###) unless the lot
// is being added to an existing receipt, the lot in Quarantine, the +qty "receive"
// transaction and the uploaded documents — every row written to the AuditLog.
export async function receiveDelivery(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let lotId: number;
  try {
    const user = await requireUser();
    const fieldErrors: Record<string, string> = {};

    // --- 1–2: category and item ------------------------------------------------
    const category = await prisma.category.findUnique({ where: { id: Number(formData.get("categoryId")) } });
    if (!category) return { error: "Pick what you are receiving." };
    const config = parseCategoryConfig(category.config);

    const isNewItem = formData.get("itemMode") === "new";
    let existingItem: Awaited<ReturnType<typeof loadItem>> = null;
    const newSpecs: Record<string, string> = {};
    if (isNewItem) {
      for (const f of config.specFields) {
        const v = str(formData, `spec_${f.key}`);
        if (v) newSpecs[f.key] = v;
        else if (f.required) fieldErrors[`spec_${f.key}`] = `${f.label} is required.`;
      }
      const siblings = await prisma.item.findMany({ where: { categoryId: category.id, active: true } });
      const dup = siblings.find((i) => sameSpecs(parseSpecs(i.specs), newSpecs));
      if (config.specFields.length && dup)
        return { error: `${dup.code} (${dup.name}) already has these specs. Pick it instead — a new batch does not get a new item code.` };
    } else {
      existingItem = await loadItem(Number(formData.get("itemId")));
      if (!existingItem || existingItem.categoryId !== category.id) return { error: "Pick the item you are receiving." };
    }
    const itemName = str(formData, "itemName") ?? Object.values(newSpecs).join(" ");

    // --- 3–7: receipt (new delivery) or existing receipt --------------------------
    const receiptIdParam = Number(formData.get("receiptId")) || null;
    const existingReceipt = receiptIdParam
      ? await prisma.receipt.findUnique({ where: { id: receiptIdParam }, include: { documents: { select: { type: true } } } })
      : null;
    if (receiptIdParam && !existingReceipt) return { error: "That receipt no longer exists." };

    const supplierId = existingReceipt?.supplierId ?? Number(formData.get("supplierId"));
    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) fieldErrors.supplierId = "Pick the supplier.";

    const supplierType = str(formData, "supplierType") ?? supplier?.type ?? "";
    if (!existingReceipt && !SUPPLIER_TYPES.some((t) => t.value === supplierType)) fieldErrors.supplierType = "Pick SVLSG supplier or customer-supplied.";

    const dateReceived = existingReceipt?.dateReceived ?? dateOnly(formData, "dateReceived");
    if (!dateReceived) fieldErrors.dateReceived = "Enter the date received.";
    else if (!existingReceipt && toDateInput(dateReceived) > todayDateInput())
      fieldErrors.dateReceived = "The date received cannot be in the future.";

    const carrier = str(formData, "carrierInspection");
    const qtyMatches = str(formData, "qtyMatches");
    const qtyMatchNote = str(formData, "qtyMatchNote");
    if (!existingReceipt && qtyMatches === "no" && !qtyMatchNote) fieldErrors.qtyMatchNote = "Describe the shortage or difference.";
    const segregation = str(formData, "segregation") ?? "";
    if (!existingReceipt && !SEGREGATION.some((s) => s.value === segregation)) fieldErrors.segregation = "Pick a segregation option.";

    // --- 8–15: lot -------------------------------------------------------------------
    const supplierBatchNo = str(formData, "supplierBatchNo");
    const lotNo = str(formData, "lotNo");
    const mfgDate = dateOnly(formData, "mfgDate");
    const expDate = dateOnly(formData, "expDate");
    if (mfgDate && expDate && expDate <= mfgDate) fieldErrors.expDate = "Exp date must be after mfg date.";

    const cases = int(formData, "cases", 1);
    const unitsPerCase = int(formData, "unitsPerCase", 1);
    if (!cases) fieldErrors.cases = "Enter the number of cases (1 or more).";
    if (!unitsPerCase) fieldErrors.unitsPerCase = "Enter units per case (1 or more).";
    const calculated = (cases ?? 0) * (unitsPerCase ?? 0);
    const qtyReceived = int(formData, "qtyReceived", 1) ?? calculated;
    const qtyOverrideReason = qtyReceived !== calculated ? str(formData, "qtyOverrideReason") : null;
    if (qtyReceived !== calculated && !qtyOverrideReason)
      fieldErrors.qtyOverrideReason = `Total differs from ${calculated.toLocaleString()} (cases × units) — give a reason.`;

    const unitCost = decimal(formData, "unitCost");
    if (unitCost === "invalid") fieldErrors.unitCost = "Enter a number, e.g. 0.0125";

    const location = await prisma.location.findUnique({ where: { id: Number(formData.get("locationId")) } });
    if (!location) fieldErrors.locationId = "Pick a location.";

    if (Object.keys(fieldErrors).length) return { error: "Please fix the highlighted answers.", fieldErrors };

    // --- files -------------------------------------------------------------------------
    const files = {
      specSheet: isNewItem ? fileFromForm(formData, "specSheet") : null,
      truck: existingReceipt ? null : fileFromForm(formData, "truckFile"),
      photo: fileFromForm(formData, "boxPhoto"),
      packingList: fileFromForm(formData, "packingList"),
      coa: fileFromForm(formData, "coa"),
    };

    // --- at_receiving requirements must all be met to save (spec §3) --------------------
    const draftReceipt = existingReceipt ? null : {
      supplierId,
      dateReceived,
      carrierInspectionDone: carrier === null ? null : carrier === "yes",
      poInvoiceNo: str(formData, "poInvoiceNo"),
      qtyMatchesPackingList: qtyMatches === null ? null : qtyMatches === "yes",
      segregation,
      quarantineStickerApplied: formData.get("quarantineSticker") === "on",
    };
    const missing = evaluate("at_receiving", config.requirements.at_receiving, {
      item: { specs: existingItem ? parseSpecs(existingItem.specs) : newSpecs },
      receipt: existingReceipt ?? draftReceipt!,
      lot: { supplierBatchNo, lotNo, cases, unitsPerCase, locationId: location!.id },
      supplier: supplier!,
      documents: {
        item: existingItem ? existingItem.documents.map((d) => d.type) : files.specSheet ? ["Spec sheet"] : [],
        receipt: existingReceipt ? existingReceipt.documents.map((d) => d.type) : files.truck ? ["F.WD.001"] : [],
        lot: [files.photo && "Photo", files.packingList && "Packing list", files.coa && "COA"].filter((t): t is string => !!t),
      },
    }).filter((r) => r.status === "missing");
    if (missing.length)
      return { error: `Needed before the receipt can be saved: ${missing.map((r) => r.req.label).join(", ")}.` };

    const saved = {
      specSheet: files.specSheet && (await saveUpload(files.specSheet, "items")),
      truck: files.truck && (await saveUpload(files.truck, "receipts")),
      photo: files.photo && (await saveUpload(files.photo, "lots")),
      packingList: files.packingList && (await saveUpload(files.packingList, "lots")),
      coa: files.coa && (await saveUpload(files.coa, "lots")),
    };

    lotId = await prisma.$transaction(async (tx) => {
      // Item — only for a new item TYPE
      let itemId = existingItem?.id;
      if (!itemId) {
        const code = await nextItemCode(tx, category.codePrefix);
        const item = await tx.item.create({
          data: { code, name: itemName, categoryId: category.id, specs: JSON.stringify(newSpecs) },
        });
        await auditCreate(tx, {
          userId: user.id,
          table: "Item",
          recordId: item.id,
          values: { code, name: itemName, categoryId: category.id, specs: newSpecs },
          reason: "Created while receiving",
        });
        if (saved.specSheet) await createDocument(tx, user.id, saved.specSheet, "Spec sheet", { itemId: item.id });
        itemId = item.id;
      }

      // Receipt — one delivery, may hold several lots
      let receipt = existingReceipt;
      if (!receipt) {
        const values = {
          ...draftReceipt!,
          dateReceived: dateReceived!,
          supplierId,
          supplierType,
          trackingNo: str(formData, "trackingNo"),
          qtyMatchNote,
          carrierInspectionDone: !!draftReceipt!.carrierInspectionDone,
          receivedById: user.id,
        };
        const receivingNo = await nextReceivingNo(tx, dateReceived!);
        const created = await tx.receipt.create({ data: { ...values, receivingNo } });
        await auditCreate(tx, { userId: user.id, table: "Receipt", recordId: created.id, values: { receivingNo, ...values } });
        if (saved.truck) await createDocument(tx, user.id, saved.truck, "F.WD.001", { receiptId: created.id });
        receipt = { ...created, documents: [] };
      }

      // Lot — always starts in Quarantine
      const lotValues = {
        itemId,
        receiptId: receipt.id,
        supplierBatchNo,
        lotNo,
        mfgDate,
        expDate,
        cases: cases!,
        unitsPerCase: unitsPerCase!,
        qtyReceived,
        qtyOverrideReason,
        unitCost: unitCost as string | null,
        locationId: location!.id,
        operatorId: user.id,
      };
      const lot = await tx.lot.create({ data: lotValues });
      await auditCreate(tx, { userId: user.id, table: "Lot", recordId: lot.id, values: { ...lotValues, qcStatus: lot.qcStatus } });

      // Balance is always calculated from transactions: the receipt is the first one.
      const txnValues = {
        lotId: lot.id,
        type: "receive",
        qty: qtyReceived,
        date: receipt.dateReceived,
        operatorId: user.id,
        notes: `Received on ${receipt.receivingNo}`,
      };
      const txn = await tx.inventoryTransaction.create({ data: txnValues });
      await auditCreate(tx, { userId: user.id, table: "InventoryTransaction", recordId: txn.id, values: txnValues });

      if (saved.photo) await createDocument(tx, user.id, saved.photo, "Photo", { lotId: lot.id });
      if (saved.packingList) await createDocument(tx, user.id, saved.packingList, "Packing list", { lotId: lot.id });
      if (saved.coa) await createDocument(tx, user.id, saved.coa, "COA", { lotId: lot.id });
      return lot.id;
    });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/", "layout");
  redirect(`/lots/${lotId}?received=1`);
}

function loadItem(id: number) {
  return prisma.item.findFirst({ where: { id, active: true }, include: { documents: { select: { type: true } } } });
}
