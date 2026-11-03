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

// "c-lid", 7 → "C-LID-007". Item codes are always uppercase with a 3-digit number.
export function formatItemCode(codePrefix: string, n: number) {
  return `${codePrefix.trim().toUpperCase()}-${String(n).padStart(3, "0")}`;
}

// New item code for a code prefix, e.g. C-LID-011.
// Called only when a new item TYPE is created — never for a new batch.
// Numbers already taken (e.g. a code kept from the old spreadsheet) are skipped.
export async function nextItemCode(tx: Tx, codePrefix: string) {
  const key = `ITEM:${codePrefix.trim().toUpperCase()}`;
  for (;;) {
    const code = formatItemCode(codePrefix, await nextCounter(tx, key));
    if (!(await tx.item.findUnique({ where: { code }, select: { id: true } }))) return code;
  }
}

// New receiving number, e.g. REC-2026-001 (resets each year).
// `date` is a calendar date stored as UTC midnight.
export async function nextReceivingNo(tx: Tx, date: Date) {
  const year = date.getUTCFullYear();
  const n = await nextCounter(tx, `REC-${year}`);
  return `REC-${year}-${String(n).padStart(3, "0")}`;
}
