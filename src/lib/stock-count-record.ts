// A completed stock count as a table (the record view and the export use the same rows).
import { prisma } from "./prisma";
import { categoryLabel, itemUnit } from "./category-config";
import { lotLabel } from "./records";

export async function countRecord(countId: number) {
  const count = await prisma.stockCount.findUnique({
    where: { id: countId },
    include: {
      startedBy: true,
      completedBy: true,
      lines: {
        include: { lot: { include: { item: { include: { category: true } }, location: true } } },
        orderBy: [{ lot: { item: { category: { sortOrder: "asc" } } } }, { lot: { location: { name: "asc" } } }, { lot: { item: { code: "asc" } } }, { lotId: "asc" }],
      },
    },
  });
  if (!count) return null;
  const rows = count.lines.map((l) => ({
    lineId: l.id,
    lotId: l.lotId,
    transactionId: l.transactionId,
    category: categoryLabel(l.lot.item.category),
    location: l.lot.location.name,
    itemCode: l.lot.item.code,
    itemName: l.lot.item.name,
    lot: lotLabel(l.lot),
    status: l.lot.qcStatus,
    unit: itemUnit(l.lot.item),
    systemQty: l.systemQty,
    countedQty: l.countedQty,
    difference: l.difference,
    reason: l.reason ?? "",
  }));
  return { count, rows };
}

export const COUNT_EXPORT_HEADER = ["Category", "Location", "Item code", "Item", "Lot", "QC status", "System qty", "Counted qty", "Difference", "Unit", "Reason"];

export function countExportRows(rows: NonNullable<Awaited<ReturnType<typeof countRecord>>>["rows"]) {
  return rows.map((r) => [r.category, r.location, r.itemCode, r.itemName, r.lot, r.status, r.systemQty, r.countedQty, r.difference, r.unit, r.reason]);
}
