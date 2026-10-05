// Turns raw AuditLog rows into something an auditor can read (spec §5):
// names instead of internal IDs, labels instead of column names, no empty `{}`.

import type { AuditLog, User } from "@prisma/client";
import { prisma } from "./prisma";
import { parseCategoryConfig } from "./category-config";
import { segregationLabel, supplierTypeLabel, transactionTypeLabel } from "./constants";
import { formatDate, formatDateTime, formatMoney } from "@/components/ui";

const FIELD_LABELS: Record<string, string> = {
  // shared
  name: "Name",
  active: "Active",
  notes: "Notes",
  type: "Type",
  // item
  code: "Item code",
  legacyCode: "Code in old spreadsheet",
  categoryId: "Category",
  specs: "Specs",
  // supplier
  aslApproved: "ASL approved",
  contactName: "Contact name",
  email: "Email",
  phone: "Phone",
  // receipt
  receivingNo: "Receiving no.",
  dateReceived: "Date received",
  supplierId: "Supplier",
  supplierType: "Supplier type",
  poInvoiceNo: "PO / invoice no.",
  trackingNo: "Tracking no.",
  carrierInspectionDone: "Truck inspected (F.WD.001)",
  segregation: "Special segregation",
  dockStatus: "Dock status",
  qtyMatchesPackingList: "Total matches packing list / PO",
  qtyMatchNote: "Packing list / PO note",
  qtyDiffResolution: "Quantity difference resolution",
  qtyDiffResolvedById: "Difference resolved by",
  qtyDiffResolvedAt: "Difference resolved at",
  quarantineStickerApplied: "Quarantine sticker on every box",
  receivedById: "Received by",
  // lot
  itemId: "Item",
  receiptId: "Receiving no.",
  supplierBatchNo: "Supplier batch no.",
  lotNo: "Lot no.",
  mfgDate: "Mfg date",
  expDate: "Exp date",
  cases: "Cases",
  unitsPerCase: "Units per case",
  qtyReceived: "Qty received",
  qtyOverrideReason: "Reason qty differs from cases × units",
  unitCost: "Unit cost",
  locationId: "Location",
  qcStatus: "QC status",
  releaseStickerPlaced: "Release sticker placed",
  releasedAt: "Released at",
  releasedById: "Released by",
  rejectedAt: "Rejected at",
  rejectedById: "Rejected by",
  rejectionReason: "Rejection reason",
  qcAuthorized: "QC authorized",
  role: "Role",
  initials: "Initials",
  operatorId: "Operator",
  // document
  lotId: "Lot",
  fileName: "File",
  uploadedById: "Uploaded by",
  // transaction
  qty: "Qty",
  roomId: "Room",
  productOrCustomer: "Product / customer",
  date: "Date",
  // inspection
  inspectedById: "Inspected by",
  disposition: "Disposition",
  overrideReason: "Override reason",
};

const TABLE_LABELS: Record<string, string> = {
  InventoryTransaction: "Inventory transaction",
};

const ROLE_LABELS: Record<string, string> = { user: "User", admin: "Admin", warehouse: "Warehouse (removed role)", qc: "QC (removed role)" };

const USER_FIELDS = ["receivedById", "operatorId", "releasedById", "uploadedById", "inspectedById", "qtyDiffResolvedById", "rejectedById"];

function humanize(field: string) {
  const s = field.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function ids(rows: AuditLog[], fields: string[]) {
  const out = new Set<number>();
  for (const r of rows)
    if (r.field && fields.includes(r.field))
      for (const v of [r.oldValue, r.newValue]) if (v && /^\d+$/.test(v)) out.add(Number(v));
  return [...out];
}

function recordIds(rows: AuditLog[], table: string) {
  return [...new Set(rows.filter((r) => r.tableName === table).map((r) => Number(r.recordId)))].filter(Number.isInteger);
}

async function nameMaps(rows: AuditLog[]) {
  const lotIds = [...ids(rows, ["lotId"]), ...recordIds(rows, "Lot")];
  const [categories, suppliers, items, receipts, lots, locations, rooms, users, documents, transactions, allCategories] =
    await Promise.all([
      prisma.category.findMany({ where: { id: { in: ids(rows, ["categoryId"]) } } }),
      prisma.supplier.findMany({ where: { id: { in: [...ids(rows, ["supplierId"]), ...recordIds(rows, "Supplier")] } } }),
      prisma.item.findMany({ where: { id: { in: [...ids(rows, ["itemId"]), ...recordIds(rows, "Item")] } } }),
      prisma.receipt.findMany({ where: { id: { in: [...ids(rows, ["receiptId"]), ...recordIds(rows, "Receipt")] } } }),
      prisma.lot.findMany({ where: { id: { in: lotIds } } }),
      prisma.location.findMany({ where: { id: { in: ids(rows, ["locationId"]) } } }),
      prisma.room.findMany({ where: { id: { in: ids(rows, ["roomId"]) } }, include: { location: true } }),
      prisma.user.findMany({ where: { id: { in: [...ids(rows, USER_FIELDS), ...recordIds(rows, "User")] } } }),
      prisma.document.findMany({ where: { id: { in: recordIds(rows, "Document") } } }),
      prisma.inventoryTransaction.findMany({ where: { id: { in: recordIds(rows, "InventoryTransaction") } } }),
      prisma.category.findMany({ select: { config: true } }),
    ]);

  const lotName = (l: (typeof lots)[number]) => l.supplierBatchNo ?? l.lotNo ?? `Lot #${l.id}`;
  const fk: Record<string, Map<number, string>> = {
    categoryId: new Map(categories.map((c) => [c.id, c.name])),
    supplierId: new Map(suppliers.map((s) => [s.id, s.name])),
    itemId: new Map(items.map((i) => [i.id, `${i.code} ${i.name}`])),
    receiptId: new Map(receipts.map((r) => [r.id, r.receivingNo])),
    lotId: new Map(lots.map((l) => [l.id, lotName(l)])),
    locationId: new Map(locations.map((l) => [l.id, l.name])),
    roomId: new Map(rooms.map((r) => [r.id, `${r.name} (${r.location.name})`])),
  };
  const userNames = new Map(users.map((u) => [u.id, u.name]));
  for (const f of USER_FIELDS) fk[f] = userNames;

  const records: Record<string, Map<number, string>> = {
    Item: new Map(items.map((i) => [i.id, `${i.code} ${i.name}`])),
    Supplier: new Map(suppliers.map((s) => [s.id, s.name])),
    User: new Map(users.map((u) => [u.id, `${u.name} (${u.initials})`])),
    Receipt: new Map(receipts.map((r) => [r.id, r.receivingNo])),
    Lot: new Map(lots.map((l) => [l.id, lotName(l)])),
    Document: new Map(documents.map((d) => [d.id, `${d.type} — ${d.fileName}`])),
    InventoryTransaction: new Map(
      transactions.map((t) => [t.id, `${transactionTypeLabel(t.type)} ${t.qty > 0 ? "+" : ""}${t.qty.toLocaleString()}`]),
    ),
  };

  const specLabels = new Map<string, string>();
  for (const c of allCategories) for (const f of parseCategoryConfig(c.config).specFields) specLabels.set(f.key, f.label);

  return { fk, records, specLabels };
}

type Maps = Awaited<ReturnType<typeof nameMaps>>;

function formatValue(table: string, field: string, raw: string | null, maps: Maps): string | null {
  if (raw === null || raw.trim() === "") return null;
  const fkMap = maps.fk[field];
  if (fkMap && /^\d+$/.test(raw)) return fkMap.get(Number(raw)) ?? `(deleted #${raw})`;
  if (raw === "true") return "Yes";
  if (raw === "false") return "No";
  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(raw)) {
    const d = new Date(raw);
    return raw.endsWith("T00:00:00.000Z") ? formatDate(d) : formatDateTime(d);
  }
  if (raw.startsWith("{") || raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parsed.length ? parsed.join(", ") : null;
      const entries = Object.entries(parsed as Record<string, unknown>).filter(([, v]) => v !== null && v !== "");
      if (!entries.length) return null;
      return entries.map(([k, v]) => `${maps.specLabels.get(k) ?? humanize(k)}: ${String(v)}`).join(", ");
    } catch {
      return raw;
    }
  }
  if (field === "type" && table === "Supplier") return supplierTypeLabel(raw);
  if (field === "type" && table === "InventoryTransaction") return transactionTypeLabel(raw);
  if (field === "supplierType") return supplierTypeLabel(raw);
  if (field === "role" && table === "User") return ROLE_LABELS[raw] ?? raw;
  if (field === "segregation") return segregationLabel(raw);
  if (field === "unitCost") return formatMoney(raw);
  if (/^-?\d+$/.test(raw) && ["qty", "qtyReceived", "cases", "unitsPerCase"].includes(field)) return Number(raw).toLocaleString();
  return raw;
}

export type AuditEvent = {
  key: string;
  at: Date;
  who: string;
  action: "Created" | "Changed" | "Deleted";
  record: string;
  reason: string | null;
  changes: { label: string; old: string | null; new: string | null }[];
};

// Rows written by one save share time, record, user and reason: show them as one event.
export function groupEvents(rows: (AuditLog & { user: User | null })[], maps: Maps): AuditEvent[] {
  const events: AuditEvent[] = [];
  for (const r of rows) {
    const key = [r.at.getTime(), r.tableName, r.recordId, r.action, r.userId, r.reason].join("|");
    let ev = events.at(-1);
    if (!ev || ev.key !== key) {
      const recordName = maps.records[r.tableName]?.get(Number(r.recordId)) ?? `#${r.recordId}`;
      ev = {
        key,
        at: r.at,
        who: r.user?.name ?? "System",
        action: r.action === "create" ? "Created" : r.action === "delete" ? "Deleted" : "Changed",
        record: `${TABLE_LABELS[r.tableName] ?? r.tableName} ${recordName}`,
        reason: r.reason,
        changes: [],
      };
      events.push(ev);
    }
    if (!r.field) continue;
    const oldV = formatValue(r.tableName, r.field, r.oldValue, maps);
    const newV = formatValue(r.tableName, r.field, r.newValue, maps);
    if (oldV === null && newV === null) continue;
    ev.changes.push({ label: FIELD_LABELS[r.field] ?? humanize(r.field), old: oldV, new: newV });
  }
  // rows come newest-first; show each event's fields in the order they were written
  for (const ev of events) ev.changes.reverse();
  return events.filter((ev) => ev.changes.length > 0 || ev.action !== "Changed");
}

export async function loadAuditEvents(scopes: { table: string; ids: (number | string)[] }[]) {
  const where = scopes.filter((s) => s.ids.length).map((s) => ({ tableName: s.table, recordId: { in: s.ids.map(String) } }));
  if (!where.length) return [];
  const rows = await prisma.auditLog.findMany({
    where: { OR: where },
    include: { user: true },
    orderBy: [{ at: "desc" }, { id: "desc" }],
  });
  return groupEvents(rows, await nameMaps(rows));
}
