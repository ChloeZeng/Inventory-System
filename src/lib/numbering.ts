import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

// Atomically bump a named counter and return the new value.
async function nextCounter(tx: Tx, key: string) {
  const row = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return row.value;
}

// New item code for a category prefix, e.g. C-LID-011.
// Called only when a new item TYPE is created — never for a new batch.
export async function nextItemCode(tx: Tx, codePrefix: string) {
  const n = await nextCounter(tx, `ITEM:${codePrefix}`);
  return `${codePrefix}-${String(n).padStart(3, "0")}`;
}

// New receiving number, e.g. REC-2026-001 (resets each year).
// `date` is a calendar date stored as UTC midnight.
export async function nextReceivingNo(tx: Tx, date: Date) {
  const year = date.getUTCFullYear();
  const n = await nextCounter(tx, `REC-${year}`);
  return `REC-${year}-${String(n).padStart(3, "0")}`;
}
