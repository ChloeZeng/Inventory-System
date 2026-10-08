// Synthetic lots for scale and workflow testing — ONLY against a separate test database:
//   DATABASE_URL="file:./test-scale.db" npx prisma migrate deploy
//   DATABASE_URL="file:./test-scale.db" npx prisma db seed
//   DATABASE_URL="file:./test-scale.db" npx tsx scripts/seed-synthetic.ts [lotCount]
// Deterministic (seeded random), spread over six categories and every workflow state.
import { PrismaClient } from "@prisma/client";
import { refreshLotWorkflow } from "../src/lib/workflow";

const url = process.env.DATABASE_URL ?? "";
if (!/test/i.test(url) || /dev\.db/.test(url)) {
  console.error(`Refusing to write synthetic data to "${url}". Point DATABASE_URL at a test database (its name must contain "test").`);
  process.exit(1);
}

const prisma = new PrismaClient();
const N = Number(process.argv[2]) || 1200;

let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

// state → weight. Lids have the full requirement set; other categories have none configured.
const LID_STATES = [
  ["receivingIncomplete", 5], ["notInspected", 20], ["draft", 5], ["approvedBlocked", 12], ["qtyFollowup", 4],
  ["approvedReady", 8], ["failed", 3], ["released", 20], ["usedSome", 8], ["depleted", 5], ["rejected", 5],
] as const;
const OTHER_STATES = [["quarantine", 40], ["released", 35], ["depleted", 10], ["rejected", 15]] as const;

function weighted<T extends string>(table: readonly (readonly [T, number])[]): T {
  const total = table.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [k, w] of table) if ((r -= w) < 0) return k;
  return table[0][0];
}

async function main() {
  const [wh, qc] = await Promise.all([prisma.user.findFirstOrThrow({ where: { initials: "WH" } }), prisma.user.findFirstOrThrow({ where: { initials: "QC" } })]);
  const supplier = await prisma.supplier.findFirstOrThrow({ where: { aslApproved: true, type: "svlsg" } });
  const locations = await prisma.location.findMany();
  const categories = await prisma.category.findMany();

  // a few items per category
  const items: { id: number; lids: boolean }[] = [];
  for (const c of categories) {
    for (let i = 1; i <= 5; i++) {
      const code = `${c.codePrefix}-S${String(i).padStart(2, "0")}`;
      const item = await prisma.item.upsert({
        where: { code },
        create: { code, name: `${c.name.replace(/^Components-|^Internal-Components-/, "")} sample ${i}`, categoryId: c.id, specs: JSON.stringify({ size: `${20 + i * 5}mm`, color: pick(["White", "Black", "Amber"]), material: "PP" }) },
        update: {},
      });
      items.push({ id: item.id, lids: c.codePrefix === "C-LID" });
      if (c.codePrefix === "C-LID" && i <= 4)
        await prisma.document.create({ data: { type: "Spec sheet", fileName: "spec.pdf", storagePath: "synthetic/none.pdf", mimeType: "application/pdf", uploadedById: wh.id, itemId: item.id } });
    }
  }

  const start = Date.UTC(2025, 0, 1);
  const span = Date.UTC(2026, 9, 1) - start;
  for (let n = 1; n <= N; n++) {
    const item = pick(items);
    const state = item.lids ? weighted(LID_STATES) : weighted(OTHER_STATES);
    const date = new Date(start + Math.floor((rand() * span) / 86_400_000) * 86_400_000);
    const cases = 10 + Math.floor(rand() * 100);
    const per = pick([100, 250, 500, 1020]);
    const qty = cases * per;
    const complete = state !== "receivingIncomplete";
    const docsComplete = !["approvedBlocked"].includes(state);

    const receipt = await prisma.receipt.create({
      data: {
        receivingNo: `SYN-${String(n).padStart(5, "0")}`, dateReceived: date, supplierId: supplier.id, supplierType: "svlsg",
        carrierInspectionDone: true, quarantineStickerApplied: complete, segregation: "none",
        qtyMatchesPackingList: state === "qtyFollowup" ? false : true, qtyMatchNote: state === "qtyFollowup" ? "1 case short" : null,
        poInvoiceNo: docsComplete ? `PO-${n}` : null, receivedById: wh.id,
      },
    });
    const qcStatus = ["released", "usedSome", "depleted"].includes(state) ? "Released" : state === "rejected" ? "Rejected" : "Quarantine";
    const lot = await prisma.lot.create({
      data: {
        itemId: item.id, receiptId: receipt.id, supplierBatchNo: `B${String(n).padStart(5, "0")}`, cases, unitsPerCase: per, qtyReceived: qty,
        unitCost: docsComplete ? "0.0125" : null, locationId: pick(locations).id, operatorId: wh.id, qcStatus,
        ...(qcStatus === "Released" ? { releasedAt: date, releasedById: qc.id, releaseStickerPlaced: true } : {}),
        ...(qcStatus === "Rejected" ? { rejectedAt: date, rejectedById: qc.id, rejectionReason: "Synthetic" } : {}),
      },
    });
    await prisma.inventoryTransaction.create({ data: { lotId: lot.id, type: "receive", qty, date, operatorId: wh.id } });
    if (state === "usedSome" || state === "depleted")
      await prisma.inventoryTransaction.create({ data: { lotId: lot.id, type: "production_use", qty: state === "depleted" ? -qty : -Math.floor(qty / 3), date, operatorId: wh.id, productOrCustomer: "Synthetic" } });
    await prisma.document.create({ data: { type: "Photo", fileName: "label.jpg", storagePath: "synthetic/none.jpg", mimeType: "image/jpeg", uploadedById: wh.id, lotId: lot.id } });
    if (docsComplete) await prisma.document.create({ data: { type: "COA", fileName: "coa.pdf", storagePath: "synthetic/none.pdf", mimeType: "application/pdf", uploadedById: wh.id, lotId: lot.id } });

    const disposition = state === "failed" || state === "rejected" ? "Rejected" : ["notInspected", "receivingIncomplete", "draft", "quarantine"].includes(state) ? null : "Approved";
    if (item.lids && (disposition || state === "draft"))
      await prisma.inspection.create({
        data: {
          lotId: lot.id, status: state === "draft" ? "draft" : "final", lotSize: qty, itemsSampled: 200, criticalDefects: 0, majorDefects: disposition === "Rejected" ? 30 : 1,
          minorDefects: 0, calculatedDisposition: disposition, disposition: state === "draft" ? null : disposition, inspectedById: wh.id,
          ...(state === "draft" ? {} : { confirmedById: qc.id, confirmedAt: date }),
        },
      });
  }
  const refreshed = await refreshLotWorkflow(prisma, {});
  console.log(`Created ${N} synthetic lots; workflow cache refreshed for ${refreshed} lots.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
