// DEMO RESET — clears the database and loads demo data so every inventory form can be shown:
// all ten categories, 2–3 items each and 1–2 lots each in different states (awaiting
// inspection, missing documents, QC follow-up, draft inspection, ready for release,
// released, in use).
//
//   npm run seed:demo
//
// FOR DEMOS ONLY. It deletes every row first, so it refuses to run unless the database is a
// local SQLite file directly inside prisma/ and NODE_ENV is not production
// (src/lib/demo-guard.ts). Never point it at production data.
//
// Real examples kept as given: C-BOT-001 (LiQi, lot LQ401263093) and C-LID-010
// (HongKong Tao, lot MDLSM2605131-01). Every other supplier, item and lot is demo data.

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";
import { demoResetRefusal } from "../src/lib/demo-guard";
import { auditCreate, auditUpdate } from "../src/lib/audit";
import { nextReceivingNo } from "../src/lib/numbering";
import { refreshLotWorkflow } from "../src/lib/workflow";
import { loadAnsiTables, samplingPlan } from "../src/lib/sampling";
import { UPLOAD_ROOT } from "../src/lib/uploads";
import { itemSettings } from "../src/lib/category-config";
import { DEMO_USERS, upsertAnsiTables, upsertCategories, upsertLocations, CATEGORIES } from "../prisma/catalog";
import { demoPdf, demoPng } from "./demo-files";

const PRISMA_DIR = path.join(__dirname, "..", "prisma");
// Same .env the app and Prisma use; a DATABASE_URL already in the environment wins.
try {
  process.loadEnvFile(path.join(__dirname, "..", ".env"));
} catch {
  // no .env: rely on the environment
}
const refusal = demoResetRefusal(process.env, PRISMA_DIR);
if (refusal) {
  console.error(`Refusing to reset: ${refusal}\nThe demo reset deletes every row. It only runs against a local SQLite demo file in prisma/.`);
  process.exit(1);
}

const prisma = new PrismaClient();
const DEMO_DIR = "demo"; // uploads/demo — only files this script wrote
const REASON = "Demo data";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const SUPPLIERS = [
  { name: "HongKong Tao Nutrition Health Science Company", type: "svlsg", aslApproved: true, docs: ["Supplier questionnaire", "Supplier agreement"] },
  { name: "Shenzhenshi LiQi", type: "customer_supplied", aslApproved: true, docs: ["Supplier questionnaire", "Supplier agreement"], notes: "Supplies LiQi-owned components" },
  { name: "Demo Ingredients Co.", type: "svlsg", aslApproved: true, docs: ["Supplier questionnaire", "Supplier agreement"], notes: "Demo row" },
  { name: "Demo Packaging Co.", type: "svlsg", aslApproved: true, docs: ["Supplier questionnaire"], notes: "Demo row — agreement not on file yet" },
  { name: "Demo Tablet Maker (not ASL approved)", type: "svlsg", aslApproved: false, docs: [], notes: "Demo row — shows the ASL warning" },
];

const LIQI_PRODUCT = "EGUOO-Milk Thistle";

type ItemSeed = {
  code: string; // uppercase PREFIX-### (explicit so the demo matches the examples)
  category: string; // form no.
  subType?: string;
  name: string;
  specs: { size?: string; material?: string; color?: string; labelVersion?: string };
  owner?: string;
  dedicatedProduct?: string;
  supplier?: string;
  legacyCode?: string;
  specSheet?: boolean; // default true
};

const ITEMS: ItemSeed[] = [
  // F.IV.001 Raw Ingredients (kg)
  { code: "RM-001", category: "F.IV.001", name: "Milk Thistle Extract 80%", specs: { size: "80% silymarin", material: "Milk thistle seed extract", color: "Yellow-brown powder" }, supplier: "Demo Ingredients Co." },
  { code: "RM-002", category: "F.IV.001", name: "Ascorbic Acid USP", specs: { size: "USP", material: "Ascorbic acid (vitamin C)", color: "White powder" }, supplier: "Demo Ingredients Co." },
  { code: "RM-003", category: "F.IV.001", name: "Microcrystalline Cellulose PH-102", specs: { size: "PH-102", material: "Microcrystalline cellulose", color: "White powder" }, supplier: "Demo Ingredients Co." },
  // F.IV.002 Capsules — empty shells (pcs, COA + ANSI) and finished capsules (capsules, lab tests)
  { code: "C-CAP-001", category: "F.IV.002", subType: "emptyShell", name: "Empty shell Size 0 HPMC White", specs: { size: "Size 0", material: "HPMC", color: "White" }, supplier: "Demo Packaging Co." },
  { code: "C-CAP-002", category: "F.IV.002", subType: "emptyShell", name: "Empty shell Size 00 Gelatin Clear", specs: { size: "Size 00", material: "Gelatin", color: "Clear" }, supplier: "Demo Packaging Co." },
  { code: "C-CAP-003", category: "F.IV.002", subType: "finishedCapsule", name: "Milk Thistle 500mg capsule", specs: { size: "Size 0", material: "Milk thistle extract 500mg", color: "Brown / white" }, owner: "LiQi", dedicatedProduct: LIQI_PRODUCT, supplier: "Demo Ingredients Co." },
  { code: "C-CAP-004", category: "F.IV.002", subType: "finishedCapsule", name: "Ashwagandha 400mg capsule", specs: { size: "Size 1", material: "Ashwagandha root extract 400mg", color: "Green / white" }, supplier: "Demo Ingredients Co." },
  // F.IV.003 Bottles — C-BOT-001 is a real example
  { code: "C-BOT-001", category: "F.IV.003", name: "Bottle 150ml PET Amber", specs: { size: "150ml", material: "PET", color: "Amber" }, owner: "LiQi", dedicatedProduct: LIQI_PRODUCT, supplier: "Shenzhenshi LiQi" },
  { code: "C-BOT-002", category: "F.IV.003", name: "Bottle 150ml HDPE White", specs: { size: "150ml", material: "HDPE", color: "White" }, supplier: "Demo Packaging Co." },
  { code: "C-BOT-003", category: "F.IV.003", name: "Bottle 250ml PET Amber", specs: { size: "250ml", material: "PET", color: "Amber" }, supplier: "Demo Packaging Co." },
  // F.IV.004 Lids — C-LID-010 is a real example (number kept from the old spreadsheet)
  { code: "C-LID-001", category: "F.IV.004", name: "Lid 38mm Black PP", specs: { size: "38mm", material: "PP", color: "Black" }, supplier: "Demo Packaging Co." },
  { code: "C-LID-002", category: "F.IV.004", name: "Lid 45mm White PP", specs: { size: "45mm", material: "PP", color: "White" }, supplier: "Demo Packaging Co." },
  { code: "C-LID-010", category: "F.IV.004", name: "Lid 38mm White PP", specs: { size: "38mm", material: "PP", color: "White" }, supplier: "HongKong Tao Nutrition Health Science Company", legacyCode: "C-Lids-010-38mm" },
  // F.IV.005 Labels
  { code: "C-LBL-001", category: "F.IV.005", name: "EGUOO Milk Thistle front label", specs: { size: "2 × 3 in", material: "White BOPP", color: "4-color", labelVersion: "v3 (2026-09)" }, owner: "LiQi", dedicatedProduct: LIQI_PRODUCT, supplier: "Demo Packaging Co." },
  { code: "C-LBL-002", category: "F.IV.005", name: "Lot / expiry label", specs: { size: "1 × 4 in", material: "Paper", color: "Black on white", labelVersion: "v1" }, supplier: "Demo Packaging Co." },
  // F.IV.006 Shipper Packs
  { code: "C-SP-001", category: "F.IV.006", name: "Shipper 12 × 9 × 8 in", specs: { size: "12 × 9 × 8 in", material: "Corrugated 32 ECT", color: "Kraft" }, supplier: "Demo Packaging Co.", specSheet: false },
  { code: "C-SP-002", category: "F.IV.006", name: "Shipper 16 × 12 × 10 in", specs: { size: "16 × 12 × 10 in", material: "Corrugated 44 ECT", color: "Kraft" }, supplier: "Demo Packaging Co." },
  // F.IV.007 Cardboards
  { code: "C-CB-001", category: "F.IV.007", name: "Divider 10 × 10 in", specs: { size: "10 × 10 in", material: "B-flute", color: "Kraft" }, supplier: "Demo Packaging Co." },
  { code: "C-CB-002", category: "F.IV.007", name: "Pad 12 × 12 in", specs: { size: "12 × 12 in", material: "E-flute", color: "White" }, supplier: "Demo Packaging Co." },
  // F.IV.008 Silica — canister IC-SGC, packet IC-SGP
  { code: "IC-SGC-001", category: "F.IV.008", subType: "canister", name: "Silica canister 1g", specs: { size: "1g", material: "Silica gel, HDPE canister", color: "White" }, supplier: "Demo Packaging Co." },
  { code: "IC-SGC-002", category: "F.IV.008", subType: "canister", name: "Silica canister 2g", specs: { size: "2g", material: "Silica gel, HDPE canister", color: "White" }, supplier: "Demo Packaging Co." },
  { code: "IC-SGP-001", category: "F.IV.008", subType: "packet", name: "Silica packet 2g", specs: { size: "2g", material: "Silica gel, Tyvek packet", color: "White" }, supplier: "Demo Packaging Co." },
  { code: "IC-SGP-002", category: "F.IV.008", subType: "packet", name: "Silica packet 5g", specs: { size: "5g", material: "Silica gel, paper packet", color: "Brown" }, supplier: "Demo Packaging Co." },
  // F.IV.009 Scoops
  { code: "IC-SCOOP-001", category: "F.IV.009", name: "Scoop 5cc PP White", specs: { size: "5cc", material: "PP", color: "White" }, supplier: "Demo Packaging Co." },
  { code: "IC-SCOOP-002", category: "F.IV.009", name: "Scoop 10cc PP Clear", specs: { size: "10cc", material: "PP", color: "Clear" }, supplier: "Demo Packaging Co." },
  // F.IV.010 Tablets — purchased finished bulk tablets; "in-house" is only a flag for now
  { code: "C-TB-001", category: "F.IV.010", subType: "purchased", name: "Milk Thistle 500mg tablet", specs: { size: "500mg", material: "Milk thistle tablet (EGUOO formula)", color: "Brown, oval" }, owner: "LiQi", dedicatedProduct: LIQI_PRODUCT, supplier: "Demo Tablet Maker (not ASL approved)" },
  { code: "C-TB-002", category: "F.IV.010", subType: "purchased", name: "Vitamin C 1000mg tablet", specs: { size: "1000mg", material: "Vitamin C tablet", color: "White, oblong" }, supplier: "Demo Ingredients Co." },
  { code: "C-TB-003", category: "F.IV.010", subType: "inHouse", name: "Milk Thistle 250mg tablet (in-house)", specs: { size: "250mg", material: "Milk thistle tablet (SVLSG formula)", color: "Brown, round" } },
  { code: "C-TB-004", category: "F.IV.010", subType: "inHouse", name: "Vitamin D3 25mcg tablet (in-house)", specs: { size: "25mcg", material: "Vitamin D3 tablet", color: "Yellow, round" } },
];

// What each demo lot shows:
//   quarantine     — received; release requirements may be open (missing documents)
//   draft          — an inspection draft is waiting for QC to confirm it
//   approved       — inspection approved, everything on file: ready for QC to release
//   released       — released by QC (with `usage`: in use; `changes`: loss / scrap / count adjustment)
type LotSeed = {
  item: string;
  supplier: string;
  batch: string;
  received: string; // YYYY-MM-DD
  cases: number;
  perCase: number;
  location: "1241 Alderwood" | "1283 Alviso";
  unitCost?: string;
  po?: string;
  qtyNote?: string; // total does not match the packing list (QC follow-up)
  docs: string[]; // documents on file for the lot (Photo, Packing list, COA, test results…)
  state: "quarantine" | "draft" | "approved" | "released";
  releasedOn?: string;
  usage?: { date: string; qty: number; product: string; room?: string; by?: string }[];
  changes?: { date: string; type: "loss" | "scrap" | "count_adjustment"; qty: number; reason: string; by?: string }[]; // qty signed
  by: string; // initials of who received it
  mfg?: string;
  exp?: string;
};

const LAB = ["ID test result", "Microbiology test result", "Heavy metals test result"];

// Near expiry: 25 days after the day the demo is loaded, so it stays "near" whenever you reset.
const NEAR_EXPIRY = new Date(Date.now() + 25 * 86_400_000).toISOString().slice(0, 10);

const LOTS: LotSeed[] = [
  // Real example: LiQi bottles — released, 99,540 of 142,800 used in Room #6 for EGUOO-Milk Thistle
  {
    item: "C-BOT-001", supplier: "Shenzhenshi LiQi", batch: "LQ401263093", received: "2026-05-13", cases: 340, perCase: 420,
    location: "1241 Alderwood", unitCost: "0", po: "LiQi consignment", docs: ["Photo", "Packing list"], state: "released", releasedOn: "2026-05-20",
    usage: [
      { date: "2026-06-02", qty: 60000, product: LIQI_PRODUCT, room: "#6 Packaging", by: "A2" },
      { date: "2026-08-18", qty: 39540, product: LIQI_PRODUCT, room: "#6 Packaging", by: "A3" },
    ],
    by: "A1",
  },
  {
    item: "RM-001", supplier: "Demo Ingredients Co.", batch: "MTE-26-0412", received: "2026-06-10", cases: 4, perCase: 25,
    location: "1241 Alderwood", unitCost: "38.50", po: "PO-2026-0611", docs: ["Photo", "COA", ...LAB], state: "released", releasedOn: "2026-06-24",
    usage: [{ date: "2026-07-08", qty: 40, product: LIQI_PRODUCT, room: "#6 Packaging", by: "A1" }],
    // near expiry: older stock bought late in its shelf life
    by: "A2", mfg: "2024-12-01", exp: NEAR_EXPIRY,
  },
  // Real example: 38mm lids from HongKong Tao — released, not used yet
  {
    item: "C-LID-010", supplier: "HongKong Tao Nutrition Health Science Company", batch: "MDLSM2605131-01", received: "2026-07-30", cases: 104, perCase: 1020,
    location: "1241 Alderwood", unitCost: "0.0125", po: "PO-2026-0730", docs: ["Photo", "Packing list"], state: "released", releasedOn: "2026-08-06", by: "A1",
  },
  {
    item: "IC-SGC-001", supplier: "Demo Packaging Co.", batch: "SGC-2608-117", received: "2026-08-12", cases: 10, perCase: 2000,
    location: "1241 Alderwood", unitCost: "0.018", po: "PO-2026-0805", docs: ["Photo", "Packing list", "COA"], state: "released", releasedOn: "2026-08-19",
    usage: [{ date: "2026-09-03", qty: 5000, product: LIQI_PRODUCT, room: "#6 Packaging", by: "A3" }],
    by: "A3",
  },
  {
    item: "C-CB-001", supplier: "Demo Packaging Co.", batch: "CB-0825-A", received: "2026-08-25", cases: 20, perCase: 250,
    location: "1283 Alviso", unitCost: "0.09", po: "PO-2026-0820", docs: ["Photo", "Packing list"], state: "released", releasedOn: "2026-09-01", by: "A2",
    changes: [{ date: "2026-09-22", type: "loss", qty: -250, reason: "One case crushed by a forklift in the Alviso warehouse", by: "A3" }],
  },
  {
    item: "C-TB-002", supplier: "Demo Ingredients Co.", batch: "VC1000-2609", received: "2026-09-15", cases: 20, perCase: 5000,
    location: "1283 Alviso", unitCost: "0.021", po: "PO-2026-0902", docs: ["Photo", "Packing list", "COA", ...LAB], state: "released", releasedOn: "2026-09-29",
    usage: [{ date: "2026-10-12", qty: 30000, product: "Vitamin C 1000mg (SVLSG)", by: "A2" }],
    by: "A1", mfg: "2026-08-30", exp: "2028-08-29",
  },
  // Inspection approved, everything on file — QC can release it
  {
    item: "C-LBL-001", supplier: "Demo Packaging Co.", batch: "LBL-1006-EG", received: "2026-10-06", cases: 8, perCase: 5000,
    location: "1241 Alderwood", unitCost: "0.032", po: "PO-2026-0928", docs: ["Photo", "Packing list"], state: "approved", by: "A2",
  },
  // An inspection draft waiting for QC confirmation
  {
    item: "C-BOT-002", supplier: "Demo Packaging Co.", batch: "HD150-1014", received: "2026-10-14", cases: 60, perCase: 300,
    location: "1283 Alviso", unitCost: "0.11", po: "PO-2026-1002", docs: ["Photo", "Packing list"], state: "draft", by: "A3",
  },
  // Awaiting inspection (paperwork complete)
  {
    item: "C-CAP-001", supplier: "Demo Packaging Co.", batch: "HPMC0-2610-55", received: "2026-10-20", cases: 12, perCase: 50000,
    location: "1283 Alviso", unitCost: "0.004", po: "PO-2026-1008", docs: ["Photo", "Packing list", "COA"], state: "quarantine", by: "A1",
  },
  // Finished capsules (counted in capsules): COA and ID test on file; microbiology and heavy metals pending
  {
    item: "C-CAP-003", supplier: "Demo Ingredients Co.", batch: "MTC500-2610", received: "2026-10-24", cases: 20, perCase: 10000,
    location: "1241 Alderwood", unitCost: "0.03", po: "PO-2026-1018", docs: ["Photo", "Packing list", "COA", "ID test result"], state: "quarantine", by: "A2",
    mfg: "2026-10-01", exp: "2028-09-30",
  },
  // Total does not match the packing list — QC follow-up
  {
    item: "C-LID-001", supplier: "Demo Packaging Co.", batch: "L38B-1022", received: "2026-10-22", cases: 30, perCase: 1000,
    location: "1241 Alderwood", unitCost: "0.012", po: "PO-2026-1015", qtyNote: "Packing list says 32 cases; 30 arrived (2 short).", docs: ["Photo", "Packing list"], state: "quarantine", by: "A2",
  },
  // Missing documents: lab results not back yet
  {
    item: "RM-002", supplier: "Demo Ingredients Co.", batch: "AA-26-1019", received: "2026-10-27", cases: 8, perCase: 25,
    location: "1283 Alviso", unitCost: "9.80", po: "PO-2026-1020", docs: ["Photo", "COA"], state: "quarantine", by: "A3", mfg: "2026-10-01", exp: "2029-09-30",
  },
  // Missing documents: no packing list, no PO or unit cost, and the item has no spec sheet
  {
    item: "C-SP-001", supplier: "Demo Packaging Co.", batch: "SP1298-1028", received: "2026-10-28", cases: 5, perCase: 100,
    location: "1283 Alviso", docs: ["Photo"], state: "quarantine", by: "A1",
  },
  // Missing documents: supplier COA (Silica needs COA + ANSI sampling)
  {
    item: "IC-SGP-001", supplier: "Demo Packaging Co.", batch: "SGP2-1029", received: "2026-10-29", cases: 4, perCase: 5000,
    location: "1241 Alderwood", unitCost: "0.006", po: "PO-2026-1021", docs: ["Photo", "Packing list"], state: "quarantine", by: "A2",
  },
  {
    item: "IC-SCOOP-001", supplier: "Demo Packaging Co.", batch: "SC5-1030", received: "2026-10-30", cases: 6, perCase: 2500,
    location: "1241 Alderwood", unitCost: "0.015", po: "PO-2026-1022", docs: ["Photo", "Packing list"], state: "quarantine", by: "A3",
  },
  // Purchased tablets: COA and ID test on file; microbiology and heavy metals pending
  {
    item: "C-TB-001", supplier: "Demo Tablet Maker (not ASL approved)", batch: "EGMT500-1102", received: "2026-11-02", cases: 10, perCase: 10000,
    location: "1283 Alviso", unitCost: "0.024", po: "PO-2026-1025", docs: ["Photo", "Packing list", "COA", "ID test result"], state: "quarantine", by: "A1",
    mfg: "2026-10-15", exp: "2028-10-14",
  },
];

// ---------------------------------------------------------------------------

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
const at = (s: string, hour = 10) => new Date(`${s}T${String(hour).padStart(2, "0")}:00:00.000Z`);
type Tx = Prisma.TransactionClient;

// Run `fn` and date the audit rows it writes at `when` (demo history reads like real history).
async function dated<T>(tx: Tx, when: Date, fn: () => Promise<T>) {
  const last = await tx.auditLog.findFirst({ orderBy: { id: "desc" }, select: { id: true } });
  const result = await fn();
  await tx.auditLog.updateMany({ where: { id: { gt: last?.id ?? 0 } }, data: { at: when } });
  return result;
}

let fileNo = 0;
async function demoFile(kind: string, title: string, lines: string[]) {
  fileNo++;
  const photo = kind === "Photo";
  const safe = `${title}`.replace(/[^\w.-]+/g, "_");
  const fileName = photo ? `${safe}_box_label.png` : `${safe}_${kind.replace(/[^\w]+/g, "_")}.pdf`;
  const storagePath = path.join(DEMO_DIR, `${String(fileNo).padStart(3, "0")}-${fileName}`);
  const data = photo ? demoPng(480, 320, [214, 196, 160]) : demoPdf([`DEMO ${kind}`, ...lines, "", "Placeholder created by npm run seed:demo — not a real record."]);
  await writeFile(path.join(UPLOAD_ROOT, storagePath), data);
  return { storagePath, fileName, mimeType: photo ? "image/png" : "application/pdf", sizeBytes: data.length };
}

async function addDocument(tx: Tx, userId: number, when: Date, type: string, title: string, lines: string[], attachTo: { itemId?: number; lotId?: number; receiptId?: number; supplierId?: number }) {
  const file = await demoFile(type, title, lines);
  await dated(tx, when, async () => {
    const doc = await tx.document.create({ data: { ...file, ...attachTo, type, uploadedById: userId, uploadedAt: when } });
    await auditCreate(tx, { userId, table: "Document", recordId: doc.id, values: { ...attachTo, type, fileName: doc.fileName }, reason: REASON });
  });
}

async function clearDatabase() {
  // children before parents
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.inventoryTransaction.deleteMany(),
    prisma.inspection.deleteMany(),
    prisma.document.deleteMany(),
    prisma.lot.deleteMany(),
    prisma.receipt.deleteMany(),
    prisma.item.deleteMany(),
    prisma.supplier.deleteMany(),
    prisma.room.deleteMany(),
    prisma.location.deleteMany(),
    prisma.category.deleteMany(),
    prisma.counter.deleteMany(),
    prisma.user.deleteMany(),
    prisma.ansiPlan.deleteMany(),
    prisma.ansiSampleSize.deleteMany(),
    prisma.ansiCodeLetter.deleteMany(),
  ]);
  // ids start at 1 again
  await prisma.$executeRawUnsafe(`DELETE FROM sqlite_sequence`).catch(() => undefined);
  await rm(path.join(UPLOAD_ROOT, DEMO_DIR), { recursive: true, force: true });
  await mkdir(path.join(UPLOAD_ROOT, DEMO_DIR), { recursive: true });
}

async function main() {
  console.log(`Resetting demo database (${process.env.DATABASE_URL}) …`);
  await clearDatabase();

  for (const u of DEMO_USERS) await prisma.user.create({ data: u });
  await upsertLocations(prisma);
  await upsertCategories(prisma);
  await upsertAnsiTables(prisma);

  const users = Object.fromEntries((await prisma.user.findMany()).map((u) => [u.initials, u]));
  const qc = users.QC;
  const categories = Object.fromEntries((await prisma.category.findMany()).map((c) => [c.formNo!, c]));
  const locations = Object.fromEntries((await prisma.location.findMany({ include: { rooms: true } })).map((l) => [l.name, l]));
  const tables = await loadAnsiTables(prisma);

  // suppliers (with their questionnaire / agreement where on file)
  const suppliers: Record<string, number> = {};
  for (const s of SUPPLIERS) {
    await prisma.$transaction(async (tx) => {
      const values = { name: s.name, type: s.type, aslApproved: s.aslApproved, notes: s.notes ?? null };
      const created = await dated(tx, at("2026-04-01"), async () => {
        const row = await tx.supplier.create({ data: values });
        await auditCreate(tx, { userId: qc.id, table: "Supplier", recordId: row.id, values, reason: REASON });
        return row;
      });
      suppliers[s.name] = created.id;
      for (const type of s.docs) await addDocument(tx, qc.id, at("2026-04-02"), type, s.name, [s.name], { supplierId: created.id });
    });
  }

  // items, with explicit codes; counters then continue after the highest number per prefix
  const items: Record<string, { id: number; category: (typeof categories)[string]; subType: string | null }> = {};
  const highest: Record<string, number> = {};
  for (const it of ITEMS) {
    const category = categories[it.category];
    const [, prefix, num] = /^(.*)-(\d{3})$/.exec(it.code)!;
    highest[prefix] = Math.max(highest[prefix] ?? 0, Number(num));
    await prisma.$transaction(async (tx) => {
      const values = {
        code: it.code,
        name: it.name,
        legacyCode: it.legacyCode ?? null,
        categoryId: category.id,
        subType: it.subType ?? null,
        specs: it.specs,
        owner: it.owner ?? "SVLSG",
        dedicatedProduct: it.dedicatedProduct ?? null,
        supplierId: it.supplier ? suppliers[it.supplier] : null,
      };
      const item = await dated(tx, at("2026-04-15"), async () => {
        const row = await tx.item.create({ data: { ...values, specs: JSON.stringify(it.specs), createdAt: at("2026-04-15") } });
        await auditCreate(tx, { userId: users.A1.id, table: "Item", recordId: row.id, values, reason: REASON });
        return row;
      });
      items[it.code] = { id: item.id, category, subType: it.subType ?? null };
      if (it.specSheet !== false)
        await addDocument(tx, users.A1.id, at("2026-04-15", 11), "Spec sheet", it.code, [it.code, it.name, Object.values(it.specs).join(" · ")], { itemId: item.id });
    });
  }
  for (const [prefix, value] of Object.entries(highest)) await prisma.counter.create({ data: { key: `ITEM:${prefix}`, value } });

  // lots, one delivery each, in date order (receiving numbers follow the dates)
  const sorted = [...LOTS].sort((a, b) => a.received.localeCompare(b.received));
  for (const l of sorted) {
    const item = items[l.item];
    const operator = users[l.by];
    const config = itemSettings(item.category, item.subType); // sub-type decides the inspection
    const qty = l.cases * l.perCase;
    const location = locations[l.location];
    const received = day(l.received);

    await prisma.$transaction(async (tx) => {
      const receiptValues = {
        dateReceived: received,
        supplierId: suppliers[l.supplier],
        supplierType: SUPPLIERS.find((s) => s.name === l.supplier)!.type,
        poInvoiceNo: l.po ?? null,
        carrierInspectionDone: true,
        segregation: "none",
        qtyMatchesPackingList: !l.qtyNote,
        qtyMatchNote: l.qtyNote ?? null,
        quarantineStickerApplied: true,
        receivedById: operator.id,
      };
      const { lot, receivingNo } = await dated(tx, at(l.received), async () => {
        const receivingNo = await nextReceivingNo(tx, received);
        const receipt = await tx.receipt.create({ data: { ...receiptValues, receivingNo, createdAt: at(l.received) } });
        await auditCreate(tx, { userId: operator.id, table: "Receipt", recordId: receipt.id, values: { receivingNo, ...receiptValues }, reason: REASON });
        const lotValues = {
          itemId: item.id,
          receiptId: receipt.id,
          supplierBatchNo: l.batch,
          lotNo: null,
          mfgDate: l.mfg ? day(l.mfg) : null,
          expDate: l.exp ? day(l.exp) : null,
          cases: l.cases,
          unitsPerCase: l.perCase,
          qtyReceived: qty,
          unitCost: l.unitCost ?? null,
          locationId: location.id,
          operatorId: operator.id,
        };
        const lot = await tx.lot.create({ data: { ...lotValues, createdAt: at(l.received) } });
        await auditCreate(tx, { userId: operator.id, table: "Lot", recordId: lot.id, values: { ...lotValues, qcStatus: lot.qcStatus }, reason: REASON });
        const txnValues = { lotId: lot.id, type: "receive", qty, date: received, operatorId: operator.id, notes: `Received on ${receivingNo}` };
        const txn = await tx.inventoryTransaction.create({ data: { ...txnValues, createdAt: at(l.received) } });
        await auditCreate(tx, { userId: operator.id, table: "InventoryTransaction", recordId: txn.id, values: txnValues, reason: REASON });
        return { lot, receivingNo };
      });
      await addDocument(tx, operator.id, at(l.received, 11), "F.WD.001", receivingNo, [`Carrier inspection for ${receivingNo}`], { receiptId: lot.receiptId });
      for (const type of l.docs) await addDocument(tx, operator.id, at(l.received, 12), type, l.batch, [`${l.item} lot ${l.batch}`, `Received ${l.received}`], { lotId: lot.id });

      // inspection (categories with an incoming inspection)
      const inspected = l.state !== "quarantine" && config.inspectionChecklist.length > 0;
      if (inspected) {
        const inspDay = l.releasedOn ? addDays(l.releasedOn, -2) : addDays(l.received, 3);
        const plan = samplingPlan(tables, qty);
        const draft = l.state === "draft";
        // a draft has the first half of the checklist answered
        const answered = draft ? config.inspectionChecklist.slice(0, 6) : config.inspectionChecklist;
        const checklist = Object.fromEntries(answered.map((q) => [q.key, { answer: "yes" }]));
        const data = {
          lotId: lot.id,
          status: draft ? "draft" : "final",
          lotSize: qty,
          codeLetter: plan.codeLetter,
          plan: JSON.stringify(plan.classes),
          sampleSize: plan.sampleSize,
          casesSampled: Math.min(l.cases, 5),
          itemsSampled: plan.sampleSize,
          checklist: JSON.stringify(checklist),
          criticalDefects: 0,
          majorDefects: 0,
          minorDefects: 0,
          calculatedDisposition: draft ? null : "Approved",
          disposition: draft ? null : "Approved",
          inspectedById: users.A2.id,
          inspectedAt: at(inspDay, 14),
          ...(draft ? {} : { confirmedById: qc.id, confirmedAt: at(inspDay, 16) }),
        };
        await dated(tx, at(inspDay, 16), async () => {
          const ins = await tx.inspection.create({ data });
          const audited: Record<string, unknown> = { ...data };
          delete audited.plan;
          delete audited.inspectedAt;
          await auditCreate(tx, { userId: draft ? users.A2.id : qc.id, table: "Inspection", recordId: ins.id, values: audited, reason: draft ? REASON : "QC confirmed the inspection disposition" });
        });
      }

      // release by QC, then usage
      if (l.state === "released") {
        const after = { qcStatus: "Released", releaseStickerPlaced: true, releasedAt: at(l.releasedOn!, 15), releasedById: qc.id };
        await dated(tx, at(l.releasedOn!, 15), async () => {
          await auditUpdate(tx, { userId: qc.id, table: "Lot", recordId: lot.id, before: lot, after, reason: "Released by QC — all requirements met" });
          await tx.lot.update({ where: { id: lot.id }, data: after });
        });
        for (const u of l.usage ?? []) {
          const by = users[u.by ?? "A1"];
          const room = location.rooms.find((r) => r.name === u.room) ?? null;
          const values = { lotId: lot.id, type: "production_use", qty: -u.qty, roomId: room?.id ?? null, productOrCustomer: u.product, date: day(u.date), operatorId: by.id, notes: null };
          await dated(tx, at(u.date, 13), async () => {
            const txn = await tx.inventoryTransaction.create({ data: { ...values, createdAt: at(u.date, 13) } });
            await auditCreate(tx, { userId: by.id, table: "InventoryTransaction", recordId: txn.id, values, reason: REASON });
          });
        }
      }
      // loss / scrap / count adjustment: each with its reason (on the transaction and in the audit trail)
      for (const c of l.changes ?? []) {
        const by = users[c.by ?? "A1"];
        const values = { lotId: lot.id, type: c.type, qty: c.qty, date: day(c.date), operatorId: by.id, reason: c.reason };
        await dated(tx, at(c.date, 15), async () => {
          const txn = await tx.inventoryTransaction.create({ data: { ...values, createdAt: at(c.date, 15) } });
          await auditCreate(tx, { userId: by.id, table: "InventoryTransaction", recordId: txn.id, values, reason: c.reason });
        });
      }
    });
  }

  const refreshed = await refreshLotWorkflow(prisma, {});
  const counts = {
    users: await prisma.user.count(),
    categories: await prisma.category.count(),
    suppliers: await prisma.supplier.count(),
    items: await prisma.item.count(),
    lots: refreshed,
    documents: await prisma.document.count(),
  };
  console.log("Demo data loaded:", counts);
  // every category, and every sub-type, should have 2–3 demo items
  for (const c of CATEGORIES) {
    const groups = c.config.subTypes.length ? c.config.subTypes.map((t) => ({ name: `${c.name} / ${t.label}`, key: t.key })) : [{ name: c.name, key: undefined }];
    for (const g of groups) {
      const n = ITEMS.filter((i) => i.category === c.formNo && i.subType === g.key).length;
      if (n < 2 || n > 3) console.warn(`${c.formNo} ${g.name}: ${n} demo items (expected 2–3)`);
    }
  }
}

function addDays(date: string, n: number) {
  const d = day(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
