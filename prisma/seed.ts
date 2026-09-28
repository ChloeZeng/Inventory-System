// Seed data for the SVLSG inventory prototype.
// Safe to re-run: every insert is an upsert keyed on a natural key.
//
//   npm run db:seed        (or: npx prisma db seed)

import { PrismaClient } from "@prisma/client";
import type { CategoryConfig } from "../src/lib/category-config";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Users (demo only — replaced by Google Workspace login later)
// ---------------------------------------------------------------------------
const USERS = [
  { name: "Warehouse Demo", initials: "WH", role: "warehouse" },
  { name: "QC Demo", initials: "QC", role: "qc" },
  { name: "Admin Demo", initials: "AD", role: "admin" },
];

// ---------------------------------------------------------------------------
// Locations and rooms
// TODO(confirm): which building each room is in.
// ---------------------------------------------------------------------------
const LOCATIONS: { name: string; rooms: string[] }[] = [
  { name: "1283 Alviso", rooms: [] },
  { name: "1241 Alderwood", rooms: ["#6 Packaging", "#12"] },
];

// ---------------------------------------------------------------------------
// Categories and their completeness config (spec §3, §4.1)
// ---------------------------------------------------------------------------
const LIDS_CONFIG: CategoryConfig = {
  specFields: [
    { key: "size", label: "Size", required: true },
    { key: "color", label: "Color", required: true },
    { key: "material", label: "Material / type", required: true },
  ],
  requirements: {
    at_receiving: [
      { key: "supplier", label: "Supplier", source: "field", path: "receipt.supplierId" },
      { key: "dateReceived", label: "Date received", source: "field", path: "receipt.dateReceived" },
      { key: "carrierInspection", label: "Truck inspection (F.WD.001)", source: "field", path: "receipt.carrierInspectionDone" },
      { key: "batchOrLotNo", label: "Supplier batch no. or lot no.", source: "field", anyOf: ["lot.supplierBatchNo", "lot.lotNo"] },
      { key: "cases", label: "Number of cases", source: "field", path: "lot.cases" },
      { key: "unitsPerCase", label: "Units per case", source: "field", path: "lot.unitsPerCase" },
      { key: "qtyMatch", label: "Total matches packing list / PO", source: "field", path: "receipt.qtyMatchesPackingList" },
      { key: "segregation", label: "Special segregation", source: "field", path: "receipt.segregation" },
      { key: "location", label: "Location", source: "field", path: "lot.locationId" },
      { key: "boxLabelPhoto", label: "Photo of box label", source: "document", documentType: "Photo", attachedTo: "lot" },
      { key: "quarantineSticker", label: "Quarantine sticker on every box", source: "field", path: "receipt.quarantineStickerApplied" },
    ],
    before_release: [
      { key: "specSheet", label: "Spec sheet", source: "document", documentType: "Spec sheet", attachedTo: "item" },
      { key: "poInvoiceNo", label: "PO / invoice no.", source: "field", path: "receipt.poInvoiceNo" },
      { key: "unitCost", label: "Unit cost", source: "field", path: "lot.unitCost" },
      { key: "packingListOrCoa", label: "Packing list / COA", source: "document", attachedTo: "lot", anyOf: ["Packing list", "COA"] },
      { key: "inspection", label: "F.WD.003 inspection", source: "inspection" },
    ],
  },
};

const EMPTY_CONFIG: CategoryConfig = {
  specFields: [],
  requirements: { at_receiving: [], before_release: [] },
};

// TODO: fill in spec fields / requirements / test path for the other categories.
const CATEGORIES = [
  { name: "Raw Ingredients", codePrefix: "R", testPath: null, config: EMPTY_CONFIG },
  { name: "Components-Capsules", codePrefix: "C-CAP", testPath: null, config: EMPTY_CONFIG },
  { name: "Components-Bottles", codePrefix: "C-BOT", testPath: null, config: EMPTY_CONFIG },
  { name: "Components-Lids", codePrefix: "C-LID", testPath: "ansi_sampling", config: LIDS_CONFIG },
  { name: "Components-Labels", codePrefix: "C-LABEL", testPath: null, config: EMPTY_CONFIG },
  { name: "Internal-Components-SilicaPackets", codePrefix: "INT-C-SP", testPath: null, config: EMPTY_CONFIG },
];

// ---------------------------------------------------------------------------
// Sample suppliers
// TODO(confirm): real ASL status and contacts. The second and third rows are
// fictional, only there to demo the "not ASL approved" warning and
// customer-supplied material.
// ---------------------------------------------------------------------------
const SUPPLIERS = [
  { name: "HongKong Tao Nutrition Health Science Company", type: "svlsg", aslApproved: true },
  { name: "Sample Packaging Co. (not ASL approved)", type: "svlsg", aslApproved: false, notes: "Demo row" },
  { name: "Sample Customer (customer-supplied)", type: "customer_supplied", aslApproved: true, notes: "Demo row" },
];

// Existing item from the current spreadsheet, used for the spec's test receipt.
// Its old-sheet number (010) is kept, so the next new lid becomes C-LID-011.
// TODO(confirm, spec §7 Q1): whether the size suffix belongs in the code.
const ITEMS = [
  {
    code: "C-LID-010",
    legacyCode: "C-Lids-010-38mm",
    name: "Lid 38mm",
    categoryPrefix: "C-LID",
    specs: { size: "38mm" }, // color / material to be filled in from the spec sheet
  },
];
const COUNTERS = [{ key: "ITEM:C-LID", value: 10 }];

// ---------------------------------------------------------------------------
// ANSI/ASQ Z1.4 tables
// QA MUST VERIFY THESE AGAINST THE PRINTED STANDARD BEFORE USE (spec §4.2).
// ---------------------------------------------------------------------------

// Table 1 — General Inspection Level II
const TABLE_1_LEVEL_II: [number, number | null, string][] = [
  [2, 8, "A"],
  [9, 15, "B"],
  [16, 25, "C"],
  [26, 50, "D"],
  [51, 90, "E"],
  [91, 150, "F"],
  [151, 280, "G"],
  [281, 500, "H"],
  [501, 1200, "J"],
  [1201, 3200, "K"],
  [3201, 10000, "L"],
  [10001, 35000, "M"],
  [35001, 150000, "N"],
  [150001, 500000, "P"],
  [500001, null, "Q"],
];

const SAMPLE_SIZES: [string, number][] = [
  ["A", 2], ["B", 3], ["C", 5], ["D", 8], ["E", 13], ["F", 20], ["G", 32], ["H", 50],
  ["J", 80], ["K", 125], ["L", 200], ["M", 315], ["N", 500], ["P", 800], ["Q", 1250], ["R", 2000],
];

// Table 2-A — Single sampling plans, normal inspection. "Ac/Re", ↓ = use first
// plan below, ↑ = use first plan above. Only AQLs 0.065–6.5 are seeded.
const TABLE_2A_AQLS = ["0.065", "0.10", "0.15", "0.25", "0.40", "0.65", "1.0", "1.5", "2.5", "4.0", "6.5"];
const TABLE_2A = `
     0.065  0.10  0.15  0.25  0.40  0.65   1.0   1.5   2.5   4.0   6.5
A      ↓     ↓     ↓     ↓     ↓     ↓     ↓     ↓     ↓     ↓   0/1
B      ↓     ↓     ↓     ↓     ↓     ↓     ↓     ↓     ↓   0/1     ↑
C      ↓     ↓     ↓     ↓     ↓     ↓     ↓     ↓   0/1     ↑     ↓
D      ↓     ↓     ↓     ↓     ↓     ↓     ↓   0/1     ↑     ↓   1/2
E      ↓     ↓     ↓     ↓     ↓     ↓   0/1     ↑     ↓   1/2   2/3
F      ↓     ↓     ↓     ↓     ↓   0/1     ↑     ↓   1/2   2/3   3/4
G      ↓     ↓     ↓     ↓   0/1     ↑     ↓   1/2   2/3   3/4   5/6
H      ↓     ↓     ↓   0/1     ↑     ↓   1/2   2/3   3/4   5/6   7/8
J      ↓     ↓   0/1     ↑     ↓   1/2   2/3   3/4   5/6   7/8 10/11
K      ↓   0/1     ↑     ↓   1/2   2/3   3/4   5/6   7/8 10/11 14/15
L    0/1     ↑     ↓   1/2   2/3   3/4   5/6   7/8 10/11 14/15 21/22
M      ↑     ↓   1/2   2/3   3/4   5/6   7/8 10/11 14/15 21/22     ↑
N      ↓   1/2   2/3   3/4   5/6   7/8 10/11 14/15 21/22     ↑     ↑
P    1/2   2/3   3/4   5/6   7/8 10/11 14/15 21/22     ↑     ↑     ↑
Q    2/3   3/4   5/6   7/8 10/11 14/15 21/22     ↑     ↑     ↑     ↑
R    3/4   5/6   7/8 10/11 14/15 21/22     ↑     ↑     ↑     ↑     ↑
`;

function parseTable2A() {
  const rows = TABLE_2A.trim().split("\n").slice(1);
  return rows.flatMap((line) => {
    const [codeLetter, ...cells] = line.trim().split(/\s+/);
    if (cells.length !== TABLE_2A_AQLS.length) throw new Error(`Table 2-A row ${codeLetter} has ${cells.length} cells`);
    return cells.map((cell, i) => {
      const aql = TABLE_2A_AQLS[i];
      if (cell === "↑") return { codeLetter, aql, ac: null, re: null, arrow: "up" };
      if (cell === "↓") return { codeLetter, aql, ac: null, re: null, arrow: "down" };
      const [ac, re] = cell.split("/").map(Number);
      return { codeLetter, aql, ac, re, arrow: null };
    });
  });
}

// ---------------------------------------------------------------------------

async function main() {
  for (const u of USERS) {
    await prisma.user.upsert({ where: { initials: u.initials }, create: u, update: { name: u.name, role: u.role } });
  }

  for (const loc of LOCATIONS) {
    const location = await prisma.location.upsert({ where: { name: loc.name }, create: { name: loc.name }, update: {} });
    for (const room of loc.rooms) {
      await prisma.room.upsert({
        where: { locationId_name: { locationId: location.id, name: room } },
        create: { name: room, locationId: location.id },
        update: {},
      });
    }
  }

  for (const c of CATEGORIES) {
    const data = { name: c.name, testPath: c.testPath, config: JSON.stringify(c.config) };
    await prisma.category.upsert({ where: { codePrefix: c.codePrefix }, create: { ...data, codePrefix: c.codePrefix }, update: data });
  }

  for (const s of SUPPLIERS) {
    await prisma.supplier.upsert({ where: { name: s.name }, create: s, update: {} });
  }

  for (const it of ITEMS) {
    const category = await prisma.category.findUniqueOrThrow({ where: { codePrefix: it.categoryPrefix } });
    await prisma.item.upsert({
      where: { code: it.code },
      create: {
        code: it.code,
        legacyCode: it.legacyCode,
        name: it.name,
        categoryId: category.id,
        specs: JSON.stringify(it.specs),
      },
      update: {},
    });
  }

  // Never move a counter backwards on re-seed.
  for (const c of COUNTERS) {
    const existing = await prisma.counter.findUnique({ where: { key: c.key } });
    if (!existing) await prisma.counter.create({ data: c });
    else if (existing.value < c.value) await prisma.counter.update({ where: { key: c.key }, data: { value: c.value } });
  }

  for (const [minLotSize, maxLotSize, codeLetter] of TABLE_1_LEVEL_II) {
    await prisma.ansiCodeLetter.upsert({
      where: { inspectionLevel_minLotSize: { inspectionLevel: "II", minLotSize } },
      create: { inspectionLevel: "II", minLotSize, maxLotSize, codeLetter },
      update: { maxLotSize, codeLetter },
    });
  }

  for (const [i, [codeLetter, sampleSize]] of SAMPLE_SIZES.entries()) {
    await prisma.ansiSampleSize.upsert({
      where: { codeLetter },
      create: { codeLetter, sampleSize, sortOrder: i + 1 },
      update: { sampleSize, sortOrder: i + 1 },
    });
  }

  for (const p of parseTable2A()) {
    await prisma.ansiPlan.upsert({
      where: { codeLetter_aql: { codeLetter: p.codeLetter, aql: p.aql } },
      create: p,
      update: { ac: p.ac, re: p.re, arrow: p.arrow },
    });
  }

  const counts = {
    users: await prisma.user.count(),
    locations: await prisma.location.count(),
    rooms: await prisma.room.count(),
    categories: await prisma.category.count(),
    suppliers: await prisma.supplier.count(),
    items: await prisma.item.count(),
    ansiCodeLetters: await prisma.ansiCodeLetter.count(),
    ansiSampleSizes: await prisma.ansiSampleSize.count(),
    ansiPlans: await prisma.ansiPlan.count(),
  };
  console.log("Seed complete:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
