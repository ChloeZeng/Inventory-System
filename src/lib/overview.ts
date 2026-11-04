// Queries for Home (overview) and Tasks: stock by category, missing documents, monthly
// counts due and recent activity. Lot balances come from the workflow cache (Lot.wfBalance),
// rewritten with every transaction; the ledger stays authoritative.

import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { categoryLabel, formatQty, itemUnit } from "./category-config";
import { LOT_INCLUDE, lotLabel, lotStatus } from "./records";
import { USAGE_TYPES, transactionTypeLabel } from "./constants";
import { searchWhere, type ListFilters } from "./work-queries";

// ---- Stock by category -------------------------------------------------------------------------

export type CategoryStock = {
  id: number;
  label: string;
  items: number; // active items
  available: { unit: string; qty: number }[]; // released stock, per unit (Capsules: pcs and capsules)
  quarantineLots: number; // lots in quarantine
};

export async function stockByCategory(): Promise<CategoryStock[]> {
  const [categories, items, lots] = await Promise.all([
    prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.item.findMany({ where: { active: true }, select: { id: true, categoryId: true } }),
    prisma.lot.findMany({
      where: { qcStatus: { in: ["Released", "Quarantine"] } },
      select: { qcStatus: true, wfBalance: true, item: { select: { categoryId: true, subType: true, category: true } } },
    }),
  ]);
  return categories.map((c) => {
    const available = new Map<string, number>();
    let quarantineLots = 0;
    for (const l of lots) {
      if (l.item.categoryId !== c.id) continue;
      if (l.qcStatus === "Quarantine") quarantineLots++;
      else if (l.wfBalance > 0) {
        const unit = itemUnit(l.item);
        available.set(unit, (available.get(unit) ?? 0) + l.wfBalance);
      }
    }
    const inStock = [...available].filter(([, qty]) => qty > 0).map(([unit, qty]) => ({ unit, qty }));
    return {
      id: c.id,
      label: categoryLabel(c),
      items: items.filter((i) => i.categoryId === c.id).length,
      available: inStock.length ? inStock : [{ unit: c.unit, qty: 0 }],
      quarantineLots,
    };
  });
}

export function formatAvailable(a: CategoryStock["available"]) {
  return a.map((x) => formatQty(x.qty, x.unit)).join(" · ");
}

// ---- Missing documents ---------------------------------------------------------------------------

export type MissingDocs = { lotId: number; lotLabel: string; itemName: string; itemCode: string; dateReceived: Date; documents: string[] };

// Quarantined lots with an open document requirement (packing list, COA, test results, spec sheet…).
// Only lots with open tasks are loaded (Lot.wfOpenTasks).
export async function missingDocuments(f: ListFilters = {}): Promise<MissingDocs[]> {
  const lots = await prisma.lot.findMany({
    where: { AND: [searchWhere(f), { qcStatus: "Quarantine", wfOpenTasks: { gt: 0 } }] },
    include: LOT_INCLUDE,
    orderBy: [{ receipt: { dateReceived: "asc" } }, { id: "asc" }],
  });
  return lots.flatMap((lot) => {
    const docs = lotStatus(lot).summary.open.filter((r) => r.req.source === "document").map((r) => r.req.label);
    return docs.length
      ? [{ lotId: lot.id, lotLabel: lotLabel(lot), itemName: lot.item.name, itemCode: lot.item.code, dateReceived: lot.receipt.dateReceived, documents: docs }]
      : [];
  });
}

// ---- Monthly stock count ---------------------------------------------------------------------------
// Every released lot with stock is counted once a calendar month. A count is recorded as a
// count adjustment (0 when the count matches), so a lot is due when it has none this month.

export function startOfMonth(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function countDueWhere(f: ListFilters, now: Date): Prisma.LotWhereInput {
  return {
    AND: [
      searchWhere(f),
      { qcStatus: "Released", wfBalance: { gt: 0 } },
      { transactions: { none: { type: "count_adjustment", date: { gte: startOfMonth(now) } } } },
    ],
  };
}

export function countsDueTotal(f: ListFilters = {}, now = new Date()) {
  return prisma.lot.count({ where: countDueWhere(f, now) });
}

export async function countsDue(f: ListFilters = {}, take = 10, now = new Date()) {
  const lots = await prisma.lot.findMany({
    where: countDueWhere(f, now),
    include: {
      item: { include: { category: true } },
      location: true,
      transactions: { where: { type: "count_adjustment" }, orderBy: { date: "desc" }, take: 1, select: { date: true } },
    },
    orderBy: [{ releasedAt: "asc" }, { id: "asc" }],
    take,
  });
  return lots.map((l) => ({
    lotId: l.id,
    lotLabel: lotLabel(l),
    itemName: l.item.name,
    itemCode: l.item.code,
    location: l.location.name,
    balance: formatQty(l.wfBalance, itemUnit(l.item)),
    lastCounted: l.transactions[0]?.date ?? null,
  }));
}

// ---- Recent activity --------------------------------------------------------------------------------

export type Activity = { at: Date; kind: string; text: string; lotId: number; by: string };

const ACTIVITY_TYPES = ["receive", ...USAGE_TYPES, "loss", "scrap", "count_adjustment"];

// Latest receipts, usage, releases, losses (and scrap, count adjustments, rejections).
export async function recentActivity(take = 10): Promise<Activity[]> {
  const lotInclude = { item: { include: { category: true } } } as const;
  const [txns, released, rejected] = await Promise.all([
    prisma.inventoryTransaction.findMany({
      where: { type: { in: ACTIVITY_TYPES } },
      include: { operator: true, room: true, lot: { include: lotInclude } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
    }),
    prisma.lot.findMany({ where: { releasedAt: { not: null } }, include: { ...lotInclude, releasedBy: true }, orderBy: { releasedAt: "desc" }, take }),
    prisma.lot.findMany({ where: { rejectedAt: { not: null } }, include: { ...lotInclude, rejectedBy: true }, orderBy: { rejectedAt: "desc" }, take }),
  ]);
  const rows: Activity[] = [
    ...txns.map((t) => {
      const unit = itemUnit(t.lot.item);
      const what = `${t.lot.item.code} lot ${lotLabel(t.lot)}`;
      const qty = formatQty(Math.abs(t.qty), unit);
      const text =
        t.type === "receive"
          ? `Received ${qty} of ${what}`
          : t.type === "count_adjustment"
            ? t.qty === 0
              ? `Counted ${what} — matches`
              : `Count adjustment ${t.qty > 0 ? "+" : "−"}${qty} on ${what}`
            : `${transactionTypeLabel(t.type)}: ${qty} of ${what}${t.productOrCustomer ? ` for ${t.productOrCustomer}` : ""}${t.reason && (t.type === "loss" || t.type === "scrap") ? ` — ${t.reason}` : ""}`;
      const kind = t.type === "receive" ? "Receipt" : (USAGE_TYPES as readonly string[]).includes(t.type) ? "Usage" : transactionTypeLabel(t.type);
      return { at: t.createdAt, kind, text, lotId: t.lotId, by: t.operator.name };
    }),
    ...released.map((l) => ({ at: l.releasedAt!, kind: "Release", text: `Released ${l.item.code} lot ${lotLabel(l)}`, lotId: l.id, by: l.releasedBy?.name ?? "—" })),
    ...rejected.map((l) => ({ at: l.rejectedAt!, kind: "Rejection", text: `Rejected ${l.item.code} lot ${lotLabel(l)}`, lotId: l.id, by: l.rejectedBy?.name ?? "—" })),
  ];
  return rows.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, take);
}
