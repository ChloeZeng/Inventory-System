// Creates the monthly stock count task when it is due (last working day of the month).
// The app also does this when Home, Tasks or Stock counts load; run this from a daily
// scheduler (cron) so the task exists even if nobody opens the app that day:
//   npm run counts:schedule
import { PrismaClient } from "@prisma/client";
import { ensureMonthlyCounts } from "../src/lib/stock-count-db";

const prisma = new PrismaClient();
ensureMonthlyCounts(prisma)
  .then((n) => console.log(n ? `Created ${n} monthly count task(s).` : "No monthly count due."))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
