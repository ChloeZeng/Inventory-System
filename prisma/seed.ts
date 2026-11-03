// Baseline seed for the SVLSG inventory prototype: users, locations, the ten categories,
// one real supplier and item, and the ANSI tables. Safe to re-run: every insert is an
// upsert keyed on a natural key, and nothing is deleted.
//
//   npm run db:seed        (or: npx prisma db seed)
//
// For a full demo data set (items and lots in every category) use `npm run seed:demo`,
// which CLEARS the database first — see scripts/seed-demo.ts.

import { PrismaClient } from "@prisma/client";
import { refreshLotWorkflow } from "../src/lib/workflow";
import { auditUpdate } from "../src/lib/audit";
import { DEMO_USERS, upsertAnsiTables, upsertCategories, upsertLocations } from "./catalog";

const prisma = new PrismaClient();

const RETIRED_DEMO_USERS = ["WH", "AD"]; // Warehouse Demo, Admin Demo ("QC Demo" is renamed to "QC")

const SUPPLIERS = [{ name: "HongKong Tao Nutrition Health Science Company", type: "svlsg", aslApproved: true }];

// Existing item from the current spreadsheet. Its old-sheet number (010) is kept;
// new lids skip numbers already taken (src/lib/numbering.ts).
// TODO(confirm, spec §7 Q1): whether the size suffix belongs in the code.
const ITEMS = [
  {
    code: "C-LID-010",
    legacyCode: "C-Lids-010-38mm",
    name: "Lid 38mm White PP",
    categoryPrefix: "C-LID",
    specs: { size: "38mm", material: "PP", color: "White" },
    owner: "SVLSG",
    supplierName: "HongKong Tao Nutrition Health Science Company",
  },
];

async function main() {
  // qcAuthorized is set only when a user is first created — after that it is managed on
  // the Users page and audited.
  for (const u of DEMO_USERS) {
    await prisma.user.upsert({ where: { initials: u.initials }, create: u, update: { name: u.name } });
  }
  // The previous demo users are retired. They may own history, so they are deactivated
  // (hidden from the user picker), not deleted. `npm run seed:demo` starts without them.
  for (const old of await prisma.user.findMany({ where: { initials: { in: RETIRED_DEMO_USERS }, active: true } })) {
    await prisma.$transaction(async (tx) => {
      await auditUpdate(tx, { userId: null, table: "User", recordId: old.id, before: old, after: { active: false }, reason: "Old demo user retired" });
      await tx.user.update({ where: { id: old.id }, data: { active: false } });
    });
  }
  await upsertLocations(prisma);
  await upsertCategories(prisma);
  for (const s of SUPPLIERS) {
    await prisma.supplier.upsert({ where: { name: s.name }, create: s, update: {} });
  }
  for (const it of ITEMS) {
    const category = await prisma.category.findUniqueOrThrow({ where: { codePrefix: it.categoryPrefix } });
    const supplier = await prisma.supplier.findUnique({ where: { name: it.supplierName } });
    await prisma.item.upsert({
      where: { code: it.code },
      create: {
        code: it.code,
        legacyCode: it.legacyCode,
        name: it.name,
        categoryId: category.id,
        specs: JSON.stringify(it.specs),
        owner: it.owner,
        supplierId: supplier?.id,
      },
      update: {},
    });
  }
  await upsertAnsiTables(prisma);

  // requirements may have changed: recompute every lot's workflow cache
  const refreshed = await refreshLotWorkflow(prisma, {});

  const counts = {
    users: await prisma.user.count(),
    locations: await prisma.location.count(),
    rooms: await prisma.room.count(),
    categories: await prisma.category.count(),
    suppliers: await prisma.supplier.count(),
    items: await prisma.item.count(),
    ansiPlans: await prisma.ansiPlan.count(),
    lotsWorkflowRefreshed: refreshed,
  };
  console.log("Seed complete:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
