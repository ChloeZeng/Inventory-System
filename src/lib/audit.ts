import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;
type Values = Record<string, unknown>;

function toText(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// AuditLog is append-only: these helpers only ever insert.

export async function auditCreate(
  tx: Tx,
  opts: { userId: number | null; table: string; recordId: string | number; values: Values; reason?: string },
) {
  await tx.auditLog.createMany({
    data: Object.entries(opts.values)
      .filter(([, v]) => toText(v) !== null)
      .map(([field, v]) => ({
        userId: opts.userId,
        action: "create",
        tableName: opts.table,
        recordId: String(opts.recordId),
        field,
        newValue: toText(v),
        reason: opts.reason ?? null,
      })),
  });
}

// Writes one row per changed field. Returns the number of changed fields.
export async function auditUpdate(
  tx: Tx,
  opts: {
    userId: number | null;
    table: string;
    recordId: string | number;
    before: Values;
    after: Values;
    reason?: string;
  },
) {
  const rows = Object.keys(opts.after)
    .filter((field) => toText(opts.before[field]) !== toText(opts.after[field]))
    .map((field) => ({
      userId: opts.userId,
      action: "update",
      tableName: opts.table,
      recordId: String(opts.recordId),
      field,
      oldValue: toText(opts.before[field]),
      newValue: toText(opts.after[field]),
      reason: opts.reason ?? null,
    }));
  if (rows.length) await tx.auditLog.createMany({ data: rows });
  return rows.length;
}
