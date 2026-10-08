// Recompute the lot workflow cache (Lot.wf* columns) for every lot.
// Run after migrations, after changing a category's requirements, or after bulk imports:
//   npm run db:refresh-workflow
import { PrismaClient } from "@prisma/client";
import { refreshLotWorkflow } from "../src/lib/workflow";

const prisma = new PrismaClient();

refreshLotWorkflow(prisma, {})
  .then((n) => console.log(`Workflow cache refreshed for ${n} lots.`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
