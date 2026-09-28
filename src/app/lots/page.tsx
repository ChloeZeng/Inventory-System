import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { QC_STATUSES } from "@/lib/constants";
import { LOT_INCLUDE, lotLabel, lotStatus } from "@/lib/records";
import { PageHeader, Table, buttonClass, formatDate, inputClass, secondaryButtonClass } from "@/components/ui";
import { CompletionBar } from "@/components/progress";
import { QcStatusBadge } from "@/components/qc-status-badge";

// Quick views used by the Home action buttons.
const VIEWS = {
  missing: { label: "Lots with missing info", hint: "Open requirements, oldest first." },
  inspect: { label: "Lots waiting for inspection", hint: "In quarantine and not yet inspected (F.WD.003)." },
  release: { label: "Lots ready to release", hint: "Inspection approved and every before-release requirement met." },
  usage: { label: "Released lots with stock", hint: "Pick the lot you are using." },
} as const;
type View = keyof typeof VIEWS;

export default async function LotsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; status?: string; view?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q ?? "";
  const category = sp.category ?? "";
  const view = (sp.view && sp.view in VIEWS ? sp.view : "") as View | "";
  const status = sp.status ?? (view === "usage" ? "Released" : view === "inspect" || view === "release" ? "Quarantine" : "");

  const where: Prisma.LotWhereInput = {
    ...(status ? { qcStatus: status } : {}),
    ...(category ? { item: { categoryId: Number(category) } } : {}),
    ...(q
      ? {
          OR: [
            { supplierBatchNo: { contains: q } },
            { lotNo: { contains: q } },
            { item: { code: { contains: q } } },
            { item: { name: { contains: q } } },
            { receipt: { receivingNo: { contains: q } } },
            { receipt: { supplier: { name: { contains: q } } } },
          ],
        }
      : {}),
  };

  const [categories, lots] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.lot.findMany({ where, include: LOT_INCLUDE, orderBy: [{ receipt: { dateReceived: "desc" } }, { id: "desc" }] }),
  ]);

  let rows = lots.map((lot) => ({ lot, ...lotStatus(lot) }));
  if (view === "missing") rows = rows.filter((r) => !r.summary.complete).reverse();
  if (view === "inspect") rows = rows.filter((r) => !r.lastInspection).reverse();
  if (view === "release") rows = rows.filter((r) => r.progress.next === "release");
  if (view === "usage") rows = rows.filter((r) => r.balance > 0);

  return (
    <>
      <PageHeader
        title={view ? VIEWS[view].label : "Lots"}
        subtitle={view ? VIEWS[view].hint : "Every batch received. Click a lot to see its progress and what is missing."}
        actions={
          <Link href="/receive" className={buttonClass}>
            Receive a delivery
          </Link>
        }
      />

      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        <ViewLink href="/lots" active={!view && !sp.status}>
          All
        </ViewLink>
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <ViewLink key={v} href={`/lots?view=${v}`} active={view === v}>
            {VIEWS[v].label}
          </ViewLink>
        ))}
      </div>

      <form className="mb-4 flex flex-wrap items-center gap-2">
        {view && <input type="hidden" name="view" value={view} />}
        <input name="q" defaultValue={q} placeholder="Batch, lot, item, REC no., supplier…" className={`${inputClass} max-w-xs`} />
        <select name="category" defaultValue={category} className={`${inputClass} w-auto`}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={status} className={`${inputClass} w-auto`}>
          <option value="">Any status</option>
          {QC_STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <button className={secondaryButtonClass}>Filter</button>
      </form>

      <Table
        head={["Lot", "Item", "Receiving no.", "Received", "Balance", "Status", "Complete", "Next step"]}
        empty={
          rows.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-slate-500">
              No lots here.{" "}
              {!view && !q && (
                <Link href="/receive" className="text-sky-700 hover:underline">
                  Receive the first delivery
                </Link>
              )}
            </p>
          )
        }
      >
        {rows.map(({ lot, summary, balance, progress }) => (
          <tr key={lot.id} className="align-top hover:bg-slate-50">
            <td className="px-4 py-2">
              <Link href={`/lots/${lot.id}`} className="font-mono font-medium text-sky-700 hover:underline">
                {lotLabel(lot)}
              </Link>
            </td>
            <td className="px-4 py-2">
              <span className="font-mono">{lot.item.code}</span>
              <div className="text-xs text-slate-500">{lot.item.name}</div>
            </td>
            <td className="px-4 py-2">
              <span className="font-mono">{lot.receipt.receivingNo}</span>
              <div className="text-xs text-slate-500">{lot.receipt.supplier.name}</div>
            </td>
            <td className="whitespace-nowrap px-4 py-2">{formatDate(lot.receipt.dateReceived)}</td>
            <td className="px-4 py-2 tabular-nums">
              {balance.toLocaleString()}
              <div className="text-xs text-slate-500">of {lot.qtyReceived.toLocaleString()}</div>
            </td>
            <td className="px-4 py-2">
              <QcStatusBadge status={lot.qcStatus} />
            </td>
            <td className="px-4 py-2">
              <CompletionBar summary={summary} compact />
              {!summary.complete && (
                <div className="mt-1 max-w-56 text-xs text-slate-500">Missing: {summary.missing.map((r) => r.req.label).join(", ")}</div>
              )}
            </td>
            <td className="px-4 py-2 text-slate-700">{progress.nextLabel}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}

function ViewLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 ${active ? "border-sky-700 bg-sky-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
    >
      {children}
    </Link>
  );
}
