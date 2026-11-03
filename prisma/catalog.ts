// Reference data shared by the seed (prisma/seed.ts) and the demo reset (scripts/seed-demo.ts):
// the ten inventory categories with their settings, locations, and the ANSI Z1.4 tables.
//
// Category settings are DATA. Each one is written to the Category row (formNo, sortOrder,
// codePrefix, unit, testPath) and its JSON config (sub-types, description fields,
// requirements, inspection checklist), so they can be edited later without code changes.

import type { PrismaClient } from "@prisma/client";
import type { CategoryConfig, InspectionQuestion, InventoryColumn, Requirement, SpecField } from "../src/lib/category-config";

// ---------------------------------------------------------------------------
// Demo users (replaced by Google Workspace login later). role "admin" manages users;
// QC authority is the separate per-user flag.
// ---------------------------------------------------------------------------
export const DEMO_USERS = [
  { name: "QC", initials: "QC", role: "user", qcAuthorized: true },
  { name: "Admin 1", initials: "A1", role: "admin", qcAuthorized: false },
  { name: "Admin 2", initials: "A2", role: "admin", qcAuthorized: false },
  { name: "Admin 3", initials: "A3", role: "admin", qcAuthorized: false },
];

// ---------------------------------------------------------------------------
// Locations and rooms
// TODO(confirm): which building each room is in.
// ---------------------------------------------------------------------------
export const LOCATIONS: { name: string; rooms: string[] }[] = [
  { name: "1283 Alviso", rooms: [] },
  { name: "1241 Alderwood", rooms: ["#6 Packaging", "#12"] },
];

// ---------------------------------------------------------------------------
// Requirements shared by every category
// `ref` = the form / SOP / regulation shown next to each checklist line.
// TODO(confirm with QA): refs for the plain receiving-log fields.
// ---------------------------------------------------------------------------
const AT_RECEIVING: Requirement[] = [
  { key: "supplier", label: "Supplier", source: "field", path: "receipt.supplierId", task: "Choose the supplier", ref: "Receiving log" },
  { key: "dateReceived", label: "Date received", source: "field", path: "receipt.dateReceived", notInFuture: true, task: "Correct the date received", ref: "Receiving log" },
  { key: "carrierInspection", label: "Truck inspection done", source: "field", path: "receipt.carrierInspectionDone", expect: "yes", task: "Confirm the truck inspection (F.WD.001) was done", ref: "F.WD.001" },
  { key: "batchOrLotNo", label: "Supplier batch no. or lot no.", source: "field", anyOf: ["lot.supplierBatchNo", "lot.lotNo"], task: "Enter supplier batch or lot no.", ref: "Receiving log" },
  { key: "cases", label: "Number of cases", source: "field", path: "lot.cases", task: "Enter number of cases", ref: "Receiving log" },
  { key: "unitsPerCase", label: "Quantity per case", source: "field", path: "lot.unitsPerCase", task: "Enter quantity per case", ref: "Receiving log" },
  // "No" is a legitimate answer (a shortage), but it needs QC follow-up before release.
  {
    key: "qtyMatch",
    label: "Total matches packing list / PO",
    source: "field",
    path: "receipt.qtyMatchesPackingList",
    expect: "yes",
    followUp: { note: "receipt.qtyMatchNote", resolvedBy: "receipt.qtyDiffResolution", owner: "qc" },
    task: "Confirm received quantity matches packing list / PO",
    followUpTask: "Resolve quantity difference with packing list / PO",
    ref: "Receiving log",
  },
  { key: "segregation", label: "Special segregation", source: "field", path: "receipt.segregation", task: "Choose special segregation", ref: "Receiving log" },
  { key: "location", label: "Location", source: "field", path: "lot.locationId", task: "Choose storage location", ref: "Receiving log" },
  { key: "boxLabelPhoto", label: "Photo of box label", source: "document", documentType: "Photo", attachedTo: "lot", task: "Upload box label photo", ref: "Receiving log" },
  { key: "quarantineSticker", label: "Quarantine sticker on every box", source: "field", path: "receipt.quarantineStickerApplied", expect: "yes", task: "Confirm quarantine labels are applied to every box", ref: "21 CFR 111" },
];

const SPEC_SHEET: Requirement = { key: "specSheet", label: "Spec sheet", source: "document", documentType: "Spec sheet", attachedTo: "item", task: "Upload item spec sheet", ref: "21 CFR 111" };
const PO_INVOICE: Requirement = { key: "poInvoiceNo", label: "PO / invoice no.", source: "field", path: "receipt.poInvoiceNo", task: "Enter PO / invoice no.", ref: "Receiving log" };
const UNIT_COST: Requirement = { key: "unitCost", label: "Unit cost", source: "field", path: "lot.unitCost", task: "Enter unit cost", ref: "Inventory card" };
const PACKING_LIST_OR_COA: Requirement = { key: "packingListOrCoa", label: "Packing list / COA", source: "document", attachedTo: "lot", anyOf: ["Packing list", "COA"], task: "Upload packing list / COA", ref: "21 CFR 111" };
const PACKING_LIST: Requirement = { key: "packingList", label: "Packing list", source: "document", documentType: "Packing list", attachedTo: "lot", task: "Upload packing list", ref: "Receiving log" };
const COA: Requirement = { key: "coa", label: "Supplier COA", source: "document", documentType: "COA", attachedTo: "lot", task: "Upload supplier COA", ref: "21 CFR 111" };
const INSPECTION: Requirement = { key: "inspection", label: "Incoming inspection (ANSI sampling)", source: "inspection", task: "Inspect lot (F.WD.003)", ref: "F.WD.003", owner: "qc" };
// Lab testing: identity, microbiology and heavy metals (21 CFR 111.75).
const LAB_TESTS: Requirement[] = [
  { key: "idTest", label: "Identity (ID) test", source: "document", documentType: "ID test result", attachedTo: "lot", task: "Upload identity (ID) test result", ref: "21 CFR 111.75" },
  { key: "microTest", label: "Microbiology test", source: "document", documentType: "Microbiology test result", attachedTo: "lot", task: "Upload microbiology test result", ref: "21 CFR 111.75" },
  { key: "heavyMetalsTest", label: "Heavy metals test", source: "document", documentType: "Heavy metals test result", attachedTo: "lot", task: "Upload heavy metals test result", ref: "21 CFR 111.75" },
];

// F.WD.003 checklist (spec §4.3). Questions that do not fit an item type are answered N/A.
const F_WD_003: InspectionQuestion[] = [
  { key: "sameMaterial", label: "Same material as standard?", group: "Form" },
  { key: "colorMatches", label: "Color matches standard?", group: "Form" },
  { key: "artworkMatches", label: "Artwork matches standard?", group: "Form" },
  { key: "artworkLegible", label: "Artwork complete and legible?", group: "Form" },
  { key: "packagingMatches", label: "Packaging matches QC standard?", group: "Form" },
  { key: "sameSize", label: "Same size as standard?", group: "Fit" },
  { key: "closureFits", label: "Closure and container fit?", group: "Fit" },
  { key: "closureApplies", label: "Closure can be applied and removed?", group: "Function" },
  { key: "mechanismWorks", label: "Container mechanism works?", group: "Function" },
  { key: "labelAdhesive", label: "Label adhesive sufficient / releases cleanly?", group: "Function" },
  { key: "tapeTest", label: "Tape test passed?", group: "Function" },
  { key: "rubOffTest", label: "Rub-off test passed?", group: "Function" },
];

// Description = size, material, color (labels vary by category; keys stay the same).
function description(labels: { size: string; material: string; color: string }, required = { size: true, material: true, color: true }): SpecField[] {
  return [
    { key: "size", label: labels.size, required: required.size },
    { key: "material", label: labels.material, required: required.material },
    { key: "color", label: labels.color, required: required.color },
  ];
}

function itemRequirements(specFields: SpecField[]): Requirement[] {
  return [
    ...specFields.filter((f) => f.required).map((f): Requirement => ({ key: f.key, label: f.label, source: "field", path: `item.specs.${f.key}`, ref: "Item master" })),
    { key: "specSheet", label: "Spec sheet", source: "document", documentType: "Spec sheet", attachedTo: "item", ref: "21 CFR 111" },
  ];
}

// Release requirements every category shares, then the category's own test path.
function beforeRelease(tests: Requirement[], inspection: boolean): Requirement[] {
  return [SPEC_SHEET, PO_INVOICE, UNIT_COST, ...tests, ...(inspection ? [INSPECTION] : [])];
}

function config(opts: {
  specFields: SpecField[];
  beforeRelease: Requirement[];
  inspection: boolean;
  columns: InventoryColumn[];
  subTypes?: CategoryConfig["subTypes"];
}): CategoryConfig {
  return {
    subTypes: opts.subTypes ?? [],
    specFields: opts.specFields,
    requirements: { at_receiving: AT_RECEIVING, before_release: beforeRelease(opts.beforeRelease, opts.inspection) },
    itemRequirements: itemRequirements(opts.specFields),
    inspectionChecklist: opts.inspection ? F_WD_003 : [],
    inventoryColumns: opts.columns,
  };
}

const COMPONENT = description({ size: "Size", material: "Material", color: "Color" });

// Inventory list columns (defaults; users will be able to change them). See InventoryColumn.
const col = (key: string, label: string): InventoryColumn => ({ key, label });
const OWNER = col("owner", "Owner / dedicated product");
const LOCATION = col("location", "Location");
const AVAILABLE = col("available", "Available");
const SIZE_MATERIAL_COLOR = [col("spec.size", "Size"), col("spec.material", "Material"), col("spec.color", "Color")];

export type CategorySeed = {
  formNo: string;
  name: string;
  codePrefix: string; // sub-types without their own prefix use this one
  legacyPrefixes?: string[]; // prefixes this category had before (an existing database is updated in place)
  unit: "pcs" | "kg" | "tablets" | "capsules"; // sub-types may override it
  testPath: string; // key of TEST_PATHS (src/lib/constants.ts); sub-types may override it
  config: CategoryConfig;
};

// ANSI-sampled packaging component: unit pcs, packing list / COA, F.WD.003 inspection.
function component(formNo: string, name: string, codePrefix: string, specFields: SpecField[], columns: InventoryColumn[], extra: Partial<CategorySeed> = {}): CategorySeed {
  return {
    formNo,
    name,
    codePrefix,
    unit: "pcs",
    testPath: "ansi_sampling",
    config: config({ specFields, beforeRelease: [PACKING_LIST_OR_COA], inspection: true, columns }),
    ...extra,
  };
}

// In form-number order. Item codes are always uppercase PREFIX-### (e.g. C-LID-001).
export const CATEGORIES: CategorySeed[] = [
  {
    formNo: "F.IV.001",
    name: "Raw Ingredients",
    codePrefix: "RM",
    legacyPrefixes: ["R"],
    unit: "kg",
    testPath: "lab_testing",
    config: config({
      specFields: description(
        { size: "Grade / potency", material: "Ingredient", color: "Color / form" },
        { size: false, material: true, color: false },
      ),
      beforeRelease: [PACKING_LIST_OR_COA, ...LAB_TESTS],
      inspection: false,
      columns: [col("name", "Name"), OWNER, LOCATION, col("nearestExpiry", "Nearest expiry"), AVAILABLE],
    }),
  },
  {
    formNo: "F.IV.002",
    name: "Capsules",
    codePrefix: "C-CAP",
    // the category's own settings are the empty shell's; a finished capsule overrides them
    unit: "pcs",
    testPath: "coa_ansi",
    config: config({
      subTypes: [
        { key: "emptyShell", label: "Empty shell", unit: "pcs", testPath: "coa_ansi" },
        {
          key: "finishedCapsule",
          label: "Finished capsule",
          unit: "capsules",
          testPath: "lab_testing",
          requirements: { before_release: beforeRelease([PACKING_LIST_OR_COA, ...LAB_TESTS], false) },
          inspectionChecklist: [],
        },
      ],
      specFields: COMPONENT,
      beforeRelease: [PACKING_LIST, COA],
      inspection: true,
      columns: [...SIZE_MATERIAL_COLOR, OWNER, LOCATION, AVAILABLE],
    }),
  },
  component("F.IV.003", "Bottles", "C-BOT", COMPONENT, [...SIZE_MATERIAL_COLOR, OWNER, LOCATION, AVAILABLE]),
  component("F.IV.004", "Lids", "C-LID", COMPONENT, [...SIZE_MATERIAL_COLOR, OWNER, LOCATION, AVAILABLE]),
  component(
    "F.IV.005",
    "Labels",
    "C-LBL",
    [
      ...description({ size: "Size (W × H)", material: "Material / stock", color: "Print colors" }),
      { key: "labelVersion", label: "Label version", required: true },
    ],
    [col("spec.size", "Size"), col("dedicatedProduct", "Dedicated product"), col("spec.labelVersion", "Label version"), LOCATION, AVAILABLE],
    { legacyPrefixes: ["C-LABEL"] },
  ),
  component(
    "F.IV.006",
    "Shipper Packs",
    "C-SP",
    description({ size: "Dimensions", material: "Material / type", color: "Color / print" }),
    [col("spec.size", "Size"), col("spec.material", "Material/Type"), LOCATION, AVAILABLE],
  ),
  component(
    "F.IV.007",
    "Cardboards",
    "C-CB",
    description({ size: "Dimensions", material: "Material / type", color: "Color / print" }),
    [col("spec.size", "Size"), col("spec.material", "Material/Type"), LOCATION, AVAILABLE],
  ),
  {
    formNo: "F.IV.008",
    name: "Silica",
    codePrefix: "IC-SG",
    legacyPrefixes: ["INT-C-SP"],
    unit: "pcs",
    testPath: "coa_ansi",
    config: config({
      subTypes: [
        { key: "canister", label: "Canister", codePrefix: "IC-SGC" },
        { key: "packet", label: "Packet", codePrefix: "IC-SGP" },
      ],
      specFields: description({ size: "Weight (g)", material: "Material", color: "Color" }),
      beforeRelease: [PACKING_LIST, COA],
      inspection: true,
      columns: [col("subType", "Sub-type"), col("spec.size", "Weight (g)"), LOCATION, AVAILABLE],
    }),
  },
  component(
    "F.IV.009",
    "Scoops",
    "IC-SCOOP",
    description({ size: "Volume", material: "Material", color: "Color" }),
    [col("spec.size", "Volume"), col("spec.material", "Material"), col("spec.color", "Color"), LOCATION, AVAILABLE],
  ),
  // Finished bulk tablets. "In-house" is only a flag for now: tablets produced in-house will
  // come from a future production module (batch record → bulk tablets lot).
  // TODO(production module): not built yet; do not add it here.
  // Purchased tablets also need the supplier's COA; in-house tablets have no supplier COA.
  {
    formNo: "F.IV.010",
    name: "Tablets",
    codePrefix: "C-TB",
    unit: "tablets",
    testPath: "coa_lab_testing",
    config: config({
      subTypes: [
        { key: "purchased", label: "Purchased" },
        // in-house: no supplier, so no PO / invoice and no supplier COA
        { key: "inHouse", label: "In-house", testPath: "lab_testing", requirements: { before_release: [SPEC_SHEET, UNIT_COST, ...LAB_TESTS] } },
      ],
      specFields: description(
        { size: "Strength", material: "Formula / product", color: "Color / shape" },
        { size: true, material: true, color: false },
      ),
      beforeRelease: [PACKING_LIST, COA, ...LAB_TESTS],
      inspection: false,
      columns: [col("spec.size", "Strength"), OWNER, LOCATION, AVAILABLE],
    }),
  },
];

// Create or update every category from CATEGORIES. An existing row is found by form no.,
// then by its current or a legacy prefix, so an older database is updated in place.
export async function upsertCategories(prisma: PrismaClient) {
  for (const [i, c] of CATEGORIES.entries()) {
    const data = {
      formNo: c.formNo,
      sortOrder: i + 1,
      name: c.name,
      codePrefix: c.codePrefix,
      unit: c.unit,
      testPath: c.testPath,
      config: JSON.stringify(c.config),
    };
    const existing = await prisma.category.findFirst({
      where: { OR: [{ formNo: c.formNo }, { codePrefix: { in: [c.codePrefix, ...(c.legacyPrefixes ?? [])] } }] },
    });
    if (existing) await prisma.category.update({ where: { id: existing.id }, data });
    else await prisma.category.create({ data });
  }
}

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

export async function upsertLocations(prisma: PrismaClient) {
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
}

export async function upsertAnsiTables(prisma: PrismaClient) {
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
}
