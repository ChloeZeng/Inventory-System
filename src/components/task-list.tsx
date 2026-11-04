import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ownerOfOpen } from "@/lib/completeness";
import { itemChecklist, supplierChecklist } from "@/lib/records";
import type { QueueEntry } from "@/lib/work-queries";
import { buttonClass, secondaryButtonClass } from "@/components/ui";

// Rows of the task lists (Tasks page, and the most urgent three on Home).

export function daysAgo(d: Date) {
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  return days <= 0 ? "received today" : days === 1 ? "received 1 day ago" : `received ${days} days ago`;
}

export function QueueRow({ entry: e }: { entry: QueueEntry }) {
  const t = e.task;
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <Link href={`/lots/${e.lotId}`} className="font-semibold text-slate-900 hover:underline">
            {e.itemName}
          </Link>{" "}
          <span className="font-mono text-xs text-slate-500">{e.itemCode}</span>
          <span className="text-slate-400"> · </span>
          <span className="text-slate-600">
            Lot <span className="font-mono">{e.lotLabel}</span>
          </span>
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {/* when the user can act, the button carries the task; otherwise say what it waits for */}
          {!t.canDo && <span className="text-slate-600">{t.label}</span>}
          {t.blocker && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-900">{t.blocker}</span>}
          <span className="text-xs text-slate-500">{daysAgo(e.dateReceived)}</span>
        </p>
      </div>
      <div className="shrink-0">
        {t.canDo && t.href ? (
          <Link href={t.href} className={`${buttonClass} px-3 py-1.5`}>
            {t.label}
          </Link>
        ) : (
          <Link href={`/lots/${e.lotId}`} className={`${secondaryButtonClass} px-3 py-1.5`}>
            View lot
          </Link>
        )}
      </div>
    </li>
  );
}

// Item and supplier records to complete. Item requirements that block a lot (e.g. a spec
// sheet) already appear in the lot queues.
export async function recordsToComplete() {
  const [items, suppliers] = await Promise.all([
    prisma.item.findMany({ where: { active: true }, include: { category: true, documents: { select: { type: true } } }, orderBy: { code: "asc" } }),
    prisma.supplier.findMany({ where: { active: true }, include: { documents: { select: { type: true } } }, orderBy: { name: "asc" } }),
  ]);
  const records = [
    ...items.flatMap((i) => {
      const open = itemChecklist(i).open;
      return open.length ? [{ key: `i${i.id}`, kind: "Item", title: `${i.code} ${i.name}`, missing: open.map((r) => r.req.label), href: `/items/${i.id}`, qcOnly: false }] : [];
    }),
    ...suppliers.flatMap((s) => {
      const open = supplierChecklist(s).open;
      return open.length
        ? [{ key: `s${s.id}`, kind: "Supplier", title: s.name, missing: open.map((r) => r.req.label), href: `/suppliers/${s.id}`, qcOnly: open.some((r) => ownerOfOpen(r) === "qc") }]
        : [];
    }),
  ];
  return records;
}

export type RecordTask = Awaited<ReturnType<typeof recordsToComplete>>[number];

export function RecordsList({ records, qcAuthorized }: { records: RecordTask[]; qcAuthorized: boolean }) {
  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm shadow-sm">
      {records.map((r) => (
        <li key={r.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2">
          <span className="min-w-0">
            <span className="mr-2 text-xs text-slate-500">{r.kind}</span>
            <span className="font-medium">{r.title}</span>
            <span className="block text-xs text-slate-500">Missing: {r.missing.join(", ")}</span>
            {r.qcOnly && !qcAuthorized && <span className="block text-xs text-slate-500">ASL approval requires QC authorization</span>}
          </span>
          <Link href={r.href} className="text-sm font-medium text-sky-700 hover:underline">
            {r.kind === "Item" ? "Complete item record" : "Complete supplier record"}
          </Link>
        </li>
      ))}
    </ul>
  );
}
