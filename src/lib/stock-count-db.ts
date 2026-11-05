// Stock counts in the database: the monthly task (created on schedule), the count sheet
// (every lot with stock, by category and location) and submitting a count. Every step is in
// the audit trail. Rules: stock-count.ts.

import { Prisma, type PrismaClient } from "@prisma/client";
import { auditCreate, auditUpdate } from "./audit";
import { categoryLabel, itemUnit } from "./category-config";
import { todayDateInput } from "./forms";
import { nextCountNo } from "./numbering";
import { lotLabel } from "./records";
import { refreshLotWorkflow } from "./workflow";
import { dueMonthlyCounts, readCountLine } from "./stock-count";

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

// Create the monthly count task(s) that are due and do not exist yet. Idempotent (one per
// period); called when Home, Tasks or Counts load, and by `npm run counts:schedule` (cron).
export async function ensureMonthlyCounts(db: PrismaClient, today = todayDateInput()) {
  let created = 0;
  for (const due of dueMonthlyCounts(today)) {
    if (await db.stockCount.findUnique({ where: { period: due.period }, select: { id: true } })) continue;
    try {
      await db.$transaction(async (tx) => {
        const countNo = await nextCountNo(tx, day(due.dueDate));
        const values = { countNo, kind: "monthly", period: due.period, dueDate: day(due.dueDate), status: "open" };
        const row = await tx.stockCount.create({ data: values });
        await auditCreate(tx, { userId: null, table: "StockCount", recordId: row.id, values, reason: "Created on schedule: last working day of the month" });
      });
      created++;
    } catch (e) {
      // another request created it at the same moment
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    }
  }
  return created;
}

export async function startAdhocCount(db: PrismaClient, userId: number) {
  return db.$transaction(async (tx) => {
    const today = day(todayDateInput());
    const countNo = await nextCountNo(tx, today);
    const values = { countNo, kind: "adhoc", dueDate: today, status: "open", startedById: userId };
    const row = await tx.stockCount.create({ data: values });
    await auditCreate(tx, { userId, table: "StockCount", recordId: row.id, values, reason: "Count started by hand" });
    return row.id;
  });
}

// ---- The count sheet ------------------------------------------------------------------------------

export type SheetLot = { lotId: number; lot: string; itemCode: string; itemName: string; status: string; expDate: string | null; unit: string; systemQty: number };
export type SheetGroup = { category: string; location: string; lots: SheetLot[] };

// Every lot with stock (any QC status: quarantined and rejected stock is on the shelf too),
// grouped by category (in form order) and location.
export async function countSheet(db: PrismaClient): Promise<SheetGroup[]> {
  const lots = await db.lot.findMany({
    where: { wfBalance: { gt: 0 } },
    include: { item: { include: { category: true } }, location: true },
    orderBy: [{ item: { category: { sortOrder: "asc" } } }, { location: { name: "asc" } }, { item: { code: "asc" } }, { id: "asc" }],
  });
  const groups: SheetGroup[] = [];
  for (const l of lots) {
    const category = categoryLabel(l.item.category);
    let g = groups.find((x) => x.category === category && x.location === l.location.name);
    if (!g) groups.push((g = { category, location: l.location.name, lots: [] }));
    g.lots.push({
      lotId: l.id,
      lot: lotLabel(l),
      itemCode: l.item.code,
      itemName: l.item.name,
      status: l.qcStatus,
      expDate: l.expDate ? l.expDate.toISOString().slice(0, 10) : null,
      unit: itemUnit(l.item),
      systemQty: l.wfBalance,
    });
  }
  return groups;
}

// ---- Submit ---------------------------------------------------------------------------------------

export type CountEntry = { lotId: number; shownQty: number; counted: string; reason: string | null };

export async function submitCount(db: PrismaClient, userId: number, countId: number, entries: CountEntry[], countDate: Date, notes: string | null) {
  return db.$transaction(async (tx) => {
    const count = await tx.stockCount.findUniqueOrThrow({ where: { id: countId } });
    if (count.status !== "open") return { errors: { form: "This count is already completed." } as Record<string, string> };

    // the ledger decides the system quantity, at the moment of submitting
    const lots = await tx.lot.findMany({ where: { wfBalance: { gt: 0 } }, select: { id: true } });
    const ids = [...new Set([...lots.map((l) => l.id), ...entries.map((e) => e.lotId)])];
    const sums = await tx.inventoryTransaction.groupBy({ by: ["lotId"], where: { lotId: { in: ids } }, _sum: { qty: true } });
    const balance = new Map(sums.map((s) => [s.lotId, s._sum.qty ?? 0]));

    const errors: Record<string, string> = {};
    const missing = lots.filter((l) => !entries.some((e) => e.lotId === l.id));
    if (missing.length) errors.form = `${missing.length === 1 ? "A lot" : `${missing.length} lots`} got stock after this page was opened — reload the count.`;
    const lines = entries.map((e) => {
      const system = balance.get(e.lotId) ?? 0;
      if (system !== e.shownQty) errors[`lot_${e.lotId}`] = `The system quantity changed to ${system.toLocaleString()} while counting — check and re-enter.`;
      const r = readCountLine(system, e.counted, e.reason);
      if ("error" in r) errors[`lot_${e.lotId}`] ??= r.error!;
      return { e, system, r };
    });
    if (Object.keys(errors).length) return { errors };

    const ref = count.kind === "monthly" ? `Monthly stock count ${count.countNo} (${count.period})` : `Stock count ${count.countNo}`;
    for (const { e, system, r } of lines) {
      if ("error" in r) continue;
      let transactionId: number | null = null;
      if (r.difference !== 0) {
        const v = { lotId: e.lotId, type: "count_adjustment", qty: r.difference!, date: countDate, operatorId: userId, reason: r.reason, notes: ref };
        const t = await tx.inventoryTransaction.create({ data: v });
        await auditCreate(tx, { userId, table: "InventoryTransaction", recordId: t.id, values: v, reason: r.reason! });
        transactionId = t.id;
      }
      const values = { countId, lotId: e.lotId, systemQty: system, countedQty: r.countedQty!, difference: r.difference!, reason: r.reason, transactionId };
      const line = await tx.stockCountLine.create({ data: values });
      await auditCreate(tx, { userId, table: "StockCountLine", recordId: line.id, values });
    }
    const after = { status: "completed", completedById: userId, completedAt: new Date(), countDate, notes };
    const diffs = lines.filter((l) => !("error" in l.r) && l.r.difference !== 0).length;
    await auditUpdate(tx, { userId, table: "StockCount", recordId: count.id, before: count, after, reason: `Count submitted: ${lines.length} lots, ${diffs} with a difference` });
    await tx.stockCount.update({ where: { id: count.id }, data: after });
    await refreshLotWorkflow(tx, { id: { in: lines.map((l) => l.e.lotId) } });
    return { ok: true as const, differences: diffs };
  });
}
