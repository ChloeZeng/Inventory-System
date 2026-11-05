// The Inventory list: "By item" or "By lot", per category, with selectable columns and
// filters (remembered per user). One query function feeds both the page and the export,
// so an export is exactly the current view.

import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { formatQty, itemSettings, itemUnit, parseCategoryConfig, parseSpecs, subTypeLabel, type CategoryRow } from "./category-config";
import { USAGE_TYPES } from "./constants";
import { itemChecklist, lotLabel } from "./records";
import { itemStock } from "./stock";
import { searchWhere } from "./work-queries";
import { getPreference } from "./preferences";

export type View = "item" | "lot";
export type Column = { key: string; label: string; numeric?: boolean };

export type StockFilter = "inStock" | "available" | "quarantine" | "none";
export type InventoryFilters = {
  location?: number;
  owner?: string;
  stock?: StockFilter;
  status?: "Quarantine" | "Released" | "Rejected"; // by lot
  expiringDays?: number; // by lot: expiry within N days (or already expired)
};

type Category = CategoryRow & { id: number; name: string };

// ---- Columns -----------------------------------------------------------------------------------

const ITEM_COMMON: Column[] = [
  { key: "name", label: "Name" },
  { key: "owner", label: "Owner / dedicated product" },
  { key: "dedicatedProduct", label: "Dedicated product" },
  { key: "location", label: "Location" },
  { key: "nearestExpiry", label: "Nearest expiry" },
  { key: "available", label: "Available", numeric: true },
  { key: "supplier", label: "Usual supplier" },
  { key: "unitCost", label: "Last unit cost", numeric: true },
  { key: "lastReceived", label: "Last received" },
  { key: "lastUsed", label: "Last used" },
];

// Every column the item view can show for a category (its default columns first).
export function itemColumnOptions(category: Category | null): { options: Column[]; defaults: string[] } {
  if (!category) return { options: ITEM_COMMON, defaults: ["name", "owner", "location", "available"] };
  const config = parseCategoryConfig(category.config);
  const fromCategory: Column[] = config.inventoryColumns
    .filter((c) => c.key !== "quarantine") // shown as a chip next to Available
    .map((c) => ({ ...c, numeric: c.key === "available" }));
  const extra: Column[] = [
    ...config.specFields.map((f) => ({ key: `spec.${f.key}`, label: f.label })),
    ...(config.subTypes.length ? [{ key: "subType", label: "Sub-type" }] : []),
    ...ITEM_COMMON,
  ];
  const options = [...fromCategory];
  for (const c of extra) if (!options.some((o) => o.key === c.key)) options.push(c);
  return { options, defaults: fromCategory.map((c) => c.key) };
}

const LOT_COLUMNS: Column[] = [
  { key: "item", label: "Item" },
  { key: "status", label: "Status" },
  { key: "location", label: "Location" },
  { key: "expiry", label: "Expiry" },
  { key: "remaining", label: "Remaining", numeric: true },
  { key: "received", label: "Received" },
  { key: "receivedQty", label: "Qty received", numeric: true },
  { key: "mfg", label: "Mfg date" },
  { key: "supplier", label: "Supplier" },
  { key: "owner", label: "Owner / dedicated product" },
  { key: "unitCost", label: "Unit cost", numeric: true },
  { key: "receivingNo", label: "Receiving no." },
];

export function lotColumnOptions(): { options: Column[]; defaults: string[] } {
  return { options: LOT_COLUMNS, defaults: ["item", "status", "location", "expiry", "remaining"] };
}

export function columnOptions(view: View, category: Category | null) {
  return view === "item" ? itemColumnOptions(category) : lotColumnOptions();
}

// Keep only known columns, in the options' order; fall back to the defaults.
export function pickColumns(options: Column[], wanted: string[] | null | undefined, defaults: string[]) {
  const keys = wanted?.filter((k) => options.some((o) => o.key === k));
  const chosen = keys?.length ? keys : defaults;
  return options.filter((o) => chosen.includes(o.key)).map((o) => o.key);
}

// ---- Filters -----------------------------------------------------------------------------------

const STOCK_FILTERS: StockFilter[] = ["inStock", "available", "quarantine", "none"];
const STATUSES = ["Quarantine", "Released", "Rejected"] as const;

export function readFilters(p: { get(name: string): string | null }): InventoryFilters {
  const f: InventoryFilters = {};
  const loc = Number(p.get("location"));
  if (loc) f.location = loc;
  const owner = p.get("owner")?.trim();
  if (owner) f.owner = owner;
  const stock = p.get("stock") as StockFilter;
  if (STOCK_FILTERS.includes(stock)) f.stock = stock;
  const status = p.get("status") as InventoryFilters["status"];
  if (status && (STATUSES as readonly string[]).includes(status)) f.status = status;
  const days = Number(p.get("exp"));
  if (Number.isInteger(days) && days > 0 && days <= 3650) f.expiringDays = days;
  return f;
}

export function filtersToParams(f: InventoryFilters) {
  const p: Record<string, string> = {};
  if (f.location) p.location = String(f.location);
  if (f.owner) p.owner = f.owner;
  if (f.stock) p.stock = f.stock;
  if (f.status) p.status = f.status;
  if (f.expiringDays) p.exp = String(f.expiringDays);
  return p;
}

export const DEFAULT_FILTERS: Record<View, InventoryFilters> = { item: {}, lot: { stock: "inStock" } };

export function preferenceKey(view: View, categoryId: number | null, part: "columns" | "filters") {
  return `inventory:${view}:${categoryId ?? "all"}:${part}`;
}

const LIVE = ["Released", "Quarantine"];

function itemWhere(category: Category | null, q: string | undefined, f: InventoryFilters): Prisma.ItemWhereInput {
  const and: Prisma.ItemWhereInput[] = [{ active: true }];
  if (category) and.push({ categoryId: category.id });
  if (q)
    and.push({
      OR: [{ code: { contains: q } }, { name: { contains: q } }, { specs: { contains: q } }, { owner: { contains: q } }, { dedicatedProduct: { contains: q } }],
    });
  if (f.owner) and.push({ owner: f.owner });
  const withStock = (extra: Prisma.LotWhereInput): Prisma.ItemWhereInput => ({ lots: { some: { wfBalance: { gt: 0 }, ...extra } } });
  if (f.stock === "inStock") and.push(withStock({ qcStatus: { in: LIVE } }));
  if (f.stock === "available") and.push(withStock({ qcStatus: "Released" }));
  if (f.stock === "quarantine") and.push(withStock({ qcStatus: "Quarantine" }));
  if (f.stock === "none") and.push({ lots: { none: { wfBalance: { gt: 0 }, qcStatus: { in: LIVE } } } });
  if (f.location) and.push(withStock({ qcStatus: { in: LIVE }, locationId: f.location }));
  return { AND: and };
}

function lotWhere(category: Category | null, q: string | undefined, f: InventoryFilters, today: Date): Prisma.LotWhereInput {
  const and: Prisma.LotWhereInput[] = [searchWhere({ q, categoryId: category?.id })];
  if (f.owner) and.push({ item: { owner: f.owner } });
  if (f.status) and.push({ qcStatus: f.status });
  if (f.location) and.push({ locationId: f.location });
  if (f.stock === "inStock") and.push({ wfBalance: { gt: 0 } });
  if (f.stock === "available") and.push({ wfBalance: { gt: 0 }, qcStatus: "Released" });
  if (f.stock === "quarantine") and.push({ wfBalance: { gt: 0 }, qcStatus: "Quarantine" });
  if (f.stock === "none") and.push({ wfBalance: 0 });
  if (f.expiringDays) and.push({ expDate: { not: null, lte: new Date(today.getTime() + f.expiringDays * 86_400_000) } });
  return { AND: and };
}

// ---- Rows --------------------------------------------------------------------------------------

export type Row = {
  id: number;
  href: string;
  label: string; // first, fixed column: item code or lot no.
  sub?: string; // e.g. the item code under a lot no.
  warning?: string; // item record incomplete: what is missing
  status?: string; // lot QC status
  chips?: { released: string; quarantine: string }; // next to Available (by item)
  cells: Record<string, string>; // display text per column key
  values: Record<string, string | number>; // export values (quantities as numbers)
  unit: string;
};

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

export async function inventoryRows(opts: {
  view: View;
  category: Category | null;
  q?: string;
  filters: InventoryFilters;
  page?: number;
  pageSize: number;
  today?: Date;
}): Promise<{ total: number; rows: Row[] }> {
  const today = opts.today ?? new Date();
  const skip = opts.page ? (opts.page - 1) * opts.pageSize : 0;
  return opts.view === "item" ? itemRows(opts, skip) : lotRows(opts, skip, today);
}

async function itemRows(opts: { category: Category | null; q?: string; filters: InventoryFilters; pageSize: number }, skip: number) {
  const where = itemWhere(opts.category, opts.q, opts.filters);
  const [total, items] = await Promise.all([
    prisma.item.count({ where }),
    prisma.item.findMany({
      where,
      include: { category: true, supplier: { select: { name: true } }, documents: { select: { type: true } } },
      orderBy: [{ category: { sortOrder: "asc" } }, { code: "asc" }],
      skip,
      take: opts.pageSize,
    }),
  ]);
  const ids = items.map((i) => i.id);
  const [lots, lastUse] = await Promise.all([
    prisma.lot.findMany({
      where: { itemId: { in: ids } },
      select: { id: true, itemId: true, qcStatus: true, wfBalance: true, expDate: true, unitCost: true, location: { select: { name: true } }, receipt: { select: { dateReceived: true } } },
    }),
    prisma.inventoryTransaction.groupBy({ by: ["lotId"], where: { type: { in: [...USAGE_TYPES] }, lot: { itemId: { in: ids } } }, _max: { date: true } }),
  ]);
  const lastUseByLot = new Map(lastUse.map((u) => [u.lotId, u._max.date]));

  const rows: Row[] = items.map((item) => {
    const mine = lots.filter((l) => l.itemId === item.id);
    const stock = itemStock(mine.map((l) => ({ qcStatus: l.qcStatus, balance: l.wfBalance, expDate: l.expDate, location: l.location.name })));
    const unit = itemSettings(item.category, item.subType).unit;
    const latest = [...mine].sort((a, b) => b.receipt.dateReceived.getTime() - a.receipt.dateReceived.getTime());
    const cost = latest.find((l) => l.unitCost !== null)?.unitCost ?? null;
    const used = mine.map((l) => lastUseByLot.get(l.id)).filter((d): d is Date => !!d);
    const lastUsed = used.length ? new Date(Math.max(...used.map((d) => d.getTime()))) : null;
    const specs = parseSpecs(item.specs);
    const config = parseCategoryConfig(item.category.config);
    const checklist = itemChecklist(item);
    const ownerText = item.dedicatedProduct ? `${item.owner} / ${item.dedicatedProduct}` : item.owner;

    const cells: Record<string, string> = {
      name: item.name,
      owner: ownerText,
      dedicatedProduct: item.dedicatedProduct ?? "—",
      location: stock.locations.join(", ") || "—",
      nearestExpiry: day(stock.nearestExpiry) || "—",
      available: formatQty(stock.available, unit),
      supplier: item.supplier?.name ?? "—",
      unitCost: cost !== null ? `$${cost.toString()}` : "—",
      lastReceived: day(latest[0]?.receipt.dateReceived) || "—",
      lastUsed: day(lastUsed) || "—",
      subType: subTypeLabel(config, item.subType) ?? "—",
    };
    for (const f of config.specFields) cells[`spec.${f.key}`] = specs[f.key] || "—";
    const values: Record<string, string | number> = { ...cells, available: stock.available, unitCost: cost !== null ? Number(cost) : "" };
    for (const k of Object.keys(values)) if (values[k] === "—") values[k] = "";
    return {
      id: item.id,
      href: `/items/${item.id}`,
      label: item.code,
      warning: checklist.complete ? undefined : `Record incomplete — missing: ${checklist.open.map((r) => r.req.label).join(", ")}`,
      chips: { released: formatQty(stock.available, unit), quarantine: formatQty(stock.quarantine, unit) },
      cells,
      values: { ...values, quarantine: stock.quarantine },
      unit,
    };
  });
  return { total, rows };
}

async function lotRows(opts: { category: Category | null; q?: string; filters: InventoryFilters; pageSize: number }, skip: number, today: Date) {
  const where = lotWhere(opts.category, opts.q, opts.filters, today);
  const [total, lots] = await Promise.all([
    prisma.lot.count({ where }),
    prisma.lot.findMany({
      where,
      include: { item: { include: { category: true } }, location: true, receipt: { include: { supplier: { select: { name: true } } } } },
      // first expiry first; lots without an expiry date after those with one
      orderBy: [{ expDate: { sort: "asc", nulls: "last" } }, { receipt: { dateReceived: "asc" } }, { id: "asc" }],
      skip,
      take: opts.pageSize,
    }),
  ]);
  const rows: Row[] = lots.map((l) => {
    const unit = itemUnit(l.item);
    const cells: Record<string, string> = {
      item: `${l.item.code} · ${l.item.name}`,
      status: l.qcStatus,
      location: l.location.name,
      expiry: day(l.expDate) || "—",
      remaining: formatQty(l.wfBalance, unit),
      received: day(l.receipt.dateReceived),
      receivedQty: formatQty(l.qtyReceived, unit),
      mfg: day(l.mfgDate) || "—",
      supplier: l.receipt.supplier.name,
      owner: l.item.dedicatedProduct ? `${l.item.owner} / ${l.item.dedicatedProduct}` : l.item.owner,
      unitCost: l.unitCost !== null ? `$${l.unitCost.toString()}` : "—",
      receivingNo: l.receipt.receivingNo,
    };
    const values: Record<string, string | number> = { ...cells, remaining: l.wfBalance, receivedQty: l.qtyReceived, unitCost: l.unitCost !== null ? Number(l.unitCost) : "" };
    for (const k of Object.keys(values)) if (values[k] === "—") values[k] = "";
    return { id: l.id, href: `/lots/${l.id}`, label: lotLabel(l), status: l.qcStatus, cells, values, unit };
  });
  return { total, rows };
}

// The table as plain rows for CSV / Excel: the fixed first column, the chosen columns, and the
// unit; quantities as numbers. By item, Available is followed by the quarantine quantity.
export function exportTable(view: View, columns: Column[], rows: Row[]) {
  const header = [view === "item" ? "Code" : "Lot no."];
  const keys: string[] = [];
  for (const c of columns) {
    header.push(c.label);
    keys.push(c.key);
    if (view === "item" && c.key === "available") {
      header.push("Quarantine");
      keys.push("quarantine");
    }
  }
  header.push("Unit");
  const body = rows.map((r) => [view === "item" ? r.label : r.label, ...keys.map((k) => r.values[k] ?? ""), r.unit]);
  return { header, body };
}

// ---- State for the page and the export ------------------------------------------------------------
// Category and view come from the URL. Filters come from the URL when it carries them (f=1),
// else from what this user last chose for this view and category. Columns: from the URL (cols=,
// used by the export) else the user's saved choice, else the category's defaults.

export async function inventoryState(userId: number, p: { get(name: string): string | null }) {
  const categories = await prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const category = categories.find((c) => c.id === Number(p.get("category"))) ?? null;
  const view: View = p.get("view") === "lot" ? "lot" : "item";
  const q = p.get("q")?.trim() || undefined;
  const { options, defaults } = columnOptions(view, category);
  const [savedColumns, savedFilters] = await Promise.all([
    getPreference<string[]>(userId, preferenceKey(view, category?.id ?? null, "columns")),
    getPreference<InventoryFilters>(userId, preferenceKey(view, category?.id ?? null, "filters")),
  ]);
  const urlCols = p.get("cols")?.split(",").filter(Boolean);
  const columns = pickColumns(options, urlCols ?? savedColumns, defaults);
  const filters =
    p.get("f") === "1" ? readFilters(p) : savedFilters ? readFilters({ get: (k) => (filtersToParams(savedFilters) as Record<string, string>)[k] ?? null }) : DEFAULT_FILTERS[view];
  return { categories, category, view, q, options, defaults, columns, filters };
}
