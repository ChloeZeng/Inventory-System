// Records a loss, scrap or count adjustment on a lot (server only). The balance is
// recalculated from the ledger inside the transaction and may never go below 0; the reason
// is stored on the transaction and in the audit trail; the workflow cache is refreshed.
// A repeated clientRequestId records nothing (the form was already submitted).

import type { PrismaClient } from "@prisma/client";
import { auditCreate } from "./audit";
import { itemUnit } from "./category-config";
import { readStockChange } from "./stock";
import { refreshLotWorkflow } from "./workflow";

export async function applyStockChange(
  db: PrismaClient,
  input: {
    lotId: number;
    userId: number;
    type: string | null;
    qty: string | null;
    reason: string | null;
    notes?: string | null;
    date: Date;
    clientRequestId: string;
  },
) {
  return db.$transaction(async (tx) => {
    if (await tx.inventoryTransaction.findUnique({ where: { clientRequestId: input.clientRequestId } })) return { duplicate: true as const };
    const lot = await tx.lot.findUniqueOrThrow({
      where: { id: input.lotId },
      include: { transactions: { select: { qty: true } }, item: { select: { subType: true, category: true } } },
    });
    const balance = lot.transactions.reduce((s, t) => s + t.qty, 0);
    const change = readStockChange({ type: input.type, qty: input.qty, reason: input.reason }, balance);
    if (Object.keys(change.fieldErrors).length) return { fieldErrors: change.fieldErrors };

    const values = {
      lotId: input.lotId,
      type: change.type,
      qty: change.qty!,
      roomId: null,
      date: input.date,
      operatorId: input.userId,
      reason: change.reason,
      notes: input.notes ?? null,
      clientRequestId: input.clientRequestId,
    };
    const txn = await tx.inventoryTransaction.create({ data: values });
    const audited: Record<string, unknown> = { ...values };
    delete audited.clientRequestId;
    await auditCreate(tx, { userId: input.userId, table: "InventoryTransaction", recordId: txn.id, values: audited, reason: change.reason! });
    await refreshLotWorkflow(tx, { id: input.lotId });
    return { balance: balance + change.qty!, unit: itemUnit(lot.item), type: change.type };
  });
}
