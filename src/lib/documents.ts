import type { Prisma } from "@prisma/client";
import { auditCreate } from "./audit";
import type { saveUpload } from "./uploads";

type Tx = Prisma.TransactionClient;
type AttachTo = { itemId?: number; receiptId?: number; lotId?: number; supplierId?: number };
type Saved = Awaited<ReturnType<typeof saveUpload>>;

// Record an uploaded file (already written with saveUpload, outside the DB transaction)
// against a lot, receipt, item or supplier, and log it in the audit trail.
export async function createDocument(tx: Tx, userId: number, saved: Saved, type: string, attachTo: AttachTo) {
  const doc = await tx.document.create({ data: { ...saved, ...attachTo, type, uploadedById: userId } });
  await auditCreate(tx, {
    userId,
    table: "Document",
    recordId: doc.id,
    values: { ...attachTo, type, fileName: doc.fileName },
  });
  return doc;
}
