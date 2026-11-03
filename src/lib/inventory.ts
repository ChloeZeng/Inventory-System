// Item stock and inventory-list values (data layer; the inventory pages will read from here).
// Lot balances come from the workflow cache (Lot.wfBalance), which is rewritten with every
// transaction; the ledger stays authoritative (src/lib/stock.ts).

import { prisma } from "./prisma";
import { formatQty, itemSettings, parseSpecs, type CategoryRow, type InventoryColumn } from "./category-config";
import { itemStock, type ItemStock } from "./stock";

// Stock per item, for the given items (or all).
export async function stockByItem(itemIds?: number[]): Promise<Map<number, ItemStock>> {
  const lots = await prisma.lot.findMany({
    where: itemIds ? { itemId: { in: itemIds } } : {},
    select: { itemId: true, qcStatus: true, wfBalance: true, expDate: true, location: { select: { name: true } } },
  });
  const byItem = new Map<number, typeof lots>();
  for (const l of lots) byItem.set(l.itemId, [...(byItem.get(l.itemId) ?? []), l]);
  const out = new Map<number, ItemStock>();
  for (const id of itemIds ?? [...byItem.keys()])
    out.set(id, itemStock((byItem.get(id) ?? []).map((l) => ({ qcStatus: l.qcStatus, balance: l.wfBalance, expDate: l.expDate, location: l.location.name }))));
  return out;
}

export type InventoryItem = {
  name: string;
  specs: string;
  subType: string | null;
  owner: string;
  dedicatedProduct: string | null;
  category: CategoryRow;
};

// The category's inventory columns (Category.config.inventoryColumns).
export function inventoryColumns(category: CategoryRow): InventoryColumn[] {
  return itemSettings(category).config.inventoryColumns;
}

// One cell of the inventory list, as text. Unknown keys give "—".
export function inventoryCell(column: InventoryColumn, item: InventoryItem, stock: ItemStock): string {
  const settings = itemSettings(item.category, item.subType);
  const key = column.key;
  if (key.startsWith("spec.")) return parseSpecs(item.specs)[key.slice(5)] || "—";
  switch (key) {
    case "name":
      return item.name;
    case "subType":
      return settings.subType?.label ?? "—";
    case "owner":
      return item.dedicatedProduct ? `${item.owner} / ${item.dedicatedProduct}` : item.owner;
    case "dedicatedProduct":
      return item.dedicatedProduct ?? "—";
    case "location":
      return stock.locations.join(", ") || "—";
    case "nearestExpiry":
      return stock.nearestExpiry ? stock.nearestExpiry.toISOString().slice(0, 10) : "—";
    case "available":
      return formatQty(stock.available, settings.unit);
    case "quarantine":
      return formatQty(stock.quarantine, settings.unit);
    default:
      return "—";
  }
}
