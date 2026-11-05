// Material issues in the database: reservations, the lots that can be picked, and the three
// steps (create, confirm, cancel). Every step is written to the audit trail, and stock moves
// only on confirm (as transactions linked to the issue line). Rules: material-issue.ts.

import type { Prisma, PrismaClient } from "@prisma/client";
import { auditCreate, auditUpdate } from "./audit";
import { itemSettings, itemUnit } from "./category-config";
import { lotLabel } from "./records";
import { nextIssueNo } from "./numbering";
import { refreshLotWorkflow } from "./workflow";
import { differsFromDedicated } from "./item-fields";
import { confirmLine, lineErrors, orderLots, type ConfirmInput, type LineInput } from "./material-issue";

type Db = PrismaClient | Prisma.TransactionClient;

// Planned quantities of open issues, per lot (what is reserved and cannot be picked again).
export async function reservedByLot(db: Db, lotIds?: number[], exceptIssueId?: number) {
  const rows = await db.materialIssueLine.groupBy({
    by: ["lotId"],
    where: { issue: { status: "open", ...(exceptIssueId ? { id: { not: exceptIssueId } } : {}) }, ...(lotIds ? { lotId: { in: lotIds } } : {}) },
    _sum: { plannedQty: true },
  });
  return new Map(rows.map((r) => [r.lotId, r._sum.plannedQty ?? 0]));
}

export type PickItem = {
  id: number;
  code: string;
  name: string;
  unit: string;
  dedicatedProduct: string | null;
  category: string;
  pickOrder: "fefo" | "fifo";
  lots: { id: number; label: string; available: number; expDate: string | null; received: string; location: string }[]; // in pick order
};

// Items with released stock left to pick, each with its lots in pick order (for the form).
export async function pickableItems(db: Db): Promise<PickItem[]> {
  const lots = await db.lot.findMany({
    where: { qcStatus: "Released", wfBalance: { gt: 0 }, item: { active: true } },
    include: { item: { include: { category: true } }, location: true, receipt: { select: { dateReceived: true } } },
  });
  const reserved = await reservedByLot(db, lots.map((l) => l.id));
  const byItem = new Map<number, PickItem & { raw: (typeof lots)[number][] }>();
  for (const l of lots) {
    const it = l.item;
    if (!byItem.has(it.id))
      byItem.set(it.id, {
        id: it.id,
        code: it.code,
        name: it.name,
        unit: itemUnit(it),
        dedicatedProduct: it.dedicatedProduct,
        category: it.category.name,
        pickOrder: itemSettings(it.category, it.subType).config.pickOrder,
        lots: [],
        raw: [],
      });
    byItem.get(it.id)!.raw.push(l);
  }
  const items: PickItem[] = [];
  for (const { raw, ...it } of byItem.values()) {
    const ordered = orderLots(
      raw.map((l) => ({ id: l.id, expDate: l.expDate, receivedAt: l.receipt.dateReceived, available: l.wfBalance - (reserved.get(l.id) ?? 0), l })),
      it.pickOrder,
    );
    if (!ordered.length) continue;
    items.push({
      ...it,
      lots: ordered.map((o) => ({
        id: o.id,
        label: lotLabel(o.l),
        available: o.available,
        expDate: o.expDate ? o.expDate.toISOString().slice(0, 10) : null,
        received: o.receivedAt.toISOString().slice(0, 10),
        location: o.l.location.name,
      })),
    });
  }
  return items.sort((a, b) => a.code.localeCompare(b.code));
}

// ---- Create --------------------------------------------------------------------------------------

export type IssueInput = { product: string | null; client: string | null; batchNo: string | null; date: Date | null; notes: string | null; lines: LineInput[] };

export async function createIssue(db: PrismaClient, userId: number, input: IssueInput) {
  return db.$transaction(async (tx) => {
    const errors: Record<string, string> = {};
    if (!input.product) errors.product = "Enter the product.";
    if (!input.batchNo) errors.batchNo = "Enter the production batch no.";
    if (!input.date) errors.date = "Enter the production date.";
    if (!input.lines.length) errors.lines = "Add at least one line.";

    // checked inside the transaction, against current balances and reservations
    const lotIds = input.lines.map((l) => l.lotId).filter(Boolean);
    const [items, lots, reserved] = await Promise.all([
      tx.item.findMany({ where: { id: { in: input.lines.map((l) => l.itemId).filter(Boolean) } } }),
      tx.lot.findMany({ where: { id: { in: lotIds } }, include: { transactions: { select: { qty: true } } } }),
      reservedByLot(tx, lotIds),
    ]);
    const takenInThisIssue = new Map<number, number>();
    const lines = input.lines.map((line, i) => {
      const item = items.find((x) => x.id === line.itemId) ?? null;
      const lot = lots.find((x) => x.id === line.lotId) ?? null;
      // the ledger, not the cache, decides what is there
      const available = lot ? lot.transactions.reduce((sum, t) => sum + t.qty, 0) - (reserved.get(lot.id) ?? 0) : 0;
      const already = lot ? (takenInThisIssue.get(lot.id) ?? 0) : 0;
      const { qty, errors: e } = lineErrors(i, line, { item, lot: lot && { id: lot.id, itemId: lot.itemId, qcStatus: lot.qcStatus, available } }, input.product, already);
      Object.assign(errors, e);
      if (lot && qty) takenInThisIssue.set(lot.id, already + qty);
      // the reason is kept only where it was needed: the item is dedicated to another product
      const other = !!item && differsFromDedicated(item.dedicatedProduct, input.product);
      return { itemId: line.itemId, lotId: line.lotId, plannedQty: qty ?? 0, productReason: other ? line.productReason?.trim() || null : null };
    });
    if (Object.keys(errors).length) return { errors };

    const issueNo = await nextIssueNo(tx, input.date!);
    const values = { issueNo, product: input.product!, client: input.client, batchNo: input.batchNo!, date: input.date!, notes: input.notes, status: "open", createdById: userId };
    const issue = await tx.materialIssue.create({ data: values });
    await auditCreate(tx, { userId, table: "MaterialIssue", recordId: issue.id, values });
    for (const [i, l] of lines.entries()) {
      const row = await tx.materialIssueLine.create({ data: { ...l, issueId: issue.id, sortOrder: i + 1 } });
      await auditCreate(tx, {
        userId,
        table: "MaterialIssueLine",
        recordId: row.id,
        values: { issueId: issue.id, itemId: l.itemId, lotId: l.lotId, plannedQty: l.plannedQty, productReason: l.productReason },
        reason: l.productReason ? `Item dedicated to another product: ${l.productReason}` : undefined,
      });
    }
    return { id: issue.id, issueNo };
  });
}

// ---- Confirm -------------------------------------------------------------------------------------

export async function confirmIssue(db: PrismaClient, userId: number, issueId: number, inputs: Record<number, ConfirmInput>, note: string | null) {
  return db.$transaction(async (tx) => {
    const issue = await tx.materialIssue.findUniqueOrThrow({
      where: { id: issueId },
      include: { lines: { include: { lot: { include: { transactions: { select: { qty: true } } } }, item: { include: { category: true } } }, orderBy: { sortOrder: "asc" } } },
    });
    if (issue.status !== "open") return { errors: { form: `This issue is already ${issue.status}.` } };

    const errors: Record<string, string> = {};
    const results = issue.lines.map((line, i) => {
      const r = confirmLine(i, line.plannedQty, inputs[line.id] ?? { actual: "", loss: "", returned: "" });
      Object.assign(errors, r.errors);
      return { line, ...r };
    });
    // stock check per lot: actual use + loss cannot exceed what the lot holds
    const out = new Map<number, number>();
    for (const r of results) out.set(r.line.lotId, (out.get(r.line.lotId) ?? 0) + (r.actual ?? 0) + (r.loss ?? 0));
    for (const [i, r] of results.entries()) {
      const balance = r.line.lot.transactions.reduce((s, t) => s + t.qty, 0);
      if (out.get(r.line.lotId)! > balance) errors[`line_${i}_actual`] = `Lot ${lotLabel(r.line.lot)} holds only ${balance.toLocaleString()}.`;
      if (r.line.lot.qcStatus !== "Released") errors[`line_${i}_actual`] = `Lot ${lotLabel(r.line.lot)} is ${r.line.lot.qcStatus.toLowerCase()}, not released.`;
    }
    const unbalanced = results.some((r) => Object.keys(r.errors).length === 0 && !r.balanced);
    if (unbalanced && !note) errors.confirmNote = "Actual + loss + returned differs from the planned quantity on a line — explain why.";
    if (Object.keys(errors).length) return { errors };

    const now = new Date();
    for (const r of results) {
      const { line } = r;
      const ref = `Material issue ${issue.issueNo} · batch ${issue.batchNo}`;
      if (r.actual! > 0) {
        const v = {
          lotId: line.lotId,
          type: "production_use",
          qty: -r.actual!,
          productOrCustomer: issue.product,
          date: issue.date,
          operatorId: userId,
          notes: ref,
          reason: line.productReason,
          issueLineId: line.id,
        };
        const t = await tx.inventoryTransaction.create({ data: v });
        await auditCreate(tx, { userId, table: "InventoryTransaction", recordId: t.id, values: v, reason: line.productReason ? `Used for ${issue.product} instead of dedicated product ${line.item.dedicatedProduct}: ${line.productReason}` : undefined });
      }
      if (r.loss! > 0) {
        const reason = `Production loss — ${ref}`;
        const v = { lotId: line.lotId, type: "loss", qty: -r.loss!, date: issue.date, operatorId: userId, reason, notes: ref, issueLineId: line.id };
        const t = await tx.inventoryTransaction.create({ data: v });
        await auditCreate(tx, { userId, table: "InventoryTransaction", recordId: t.id, values: v, reason });
      }
      const after = { actualQty: r.actual!, lossQty: r.loss!, returnedQty: r.returned! };
      await auditUpdate(tx, { userId, table: "MaterialIssueLine", recordId: line.id, before: line, after, reason: "Confirmed after production" });
      await tx.materialIssueLine.update({ where: { id: line.id }, data: after });
    }
    const after = { status: "confirmed", confirmedById: userId, confirmedAt: now, confirmNote: note };
    await auditUpdate(tx, { userId, table: "MaterialIssue", recordId: issue.id, before: issue, after, reason: note ?? "Confirmed after production" });
    await tx.materialIssue.update({ where: { id: issue.id }, data: after });
    await refreshLotWorkflow(tx, { id: { in: [...new Set(issue.lines.map((l) => l.lotId))] } });
    return { ok: true as const };
  });
}

// ---- Cancel --------------------------------------------------------------------------------------

export async function cancelIssue(db: PrismaClient, userId: number, issueId: number, reason: string) {
  return db.$transaction(async (tx) => {
    const issue = await tx.materialIssue.findUniqueOrThrow({ where: { id: issueId } });
    if (issue.status !== "open") return { error: `This issue is already ${issue.status}.` };
    const after = { status: "cancelled", cancelledById: userId, cancelledAt: new Date(), cancelReason: reason };
    await auditUpdate(tx, { userId, table: "MaterialIssue", recordId: issue.id, before: issue, after, reason });
    await tx.materialIssue.update({ where: { id: issue.id }, data: after });
    return { ok: true as const };
  });
}
