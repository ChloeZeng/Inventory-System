import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { QC_STATUSES } from "@/lib/constants";
import { lotLabel } from "@/lib/records";
import { STAGE_LABELS } from "@/lib/workflow";
import { LOT_VIEWS, lotPage, type LotView } from "@/lib/work-queries";
import { PageHeader, Table, buttonClass, formatDate, inputClass, secondaryButtonClass } from "@/components/ui";
import { QcStatusBadge } from "@/components/qc-status-badge";

const PAGE_SIZE = 25;

// The searchable, filterable, paginated list of every lot. Filters, counts and
// pagination run in the database; the Next step column uses the shared workflow.
export default async function LotsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; status?: string; view?: string; sort?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const view = (sp.view && sp.view in LOT_VIEWS ? sp.view : undefined) as LotView | undefined;
  const status = sp.status && (QC_STATUSES as readonly string[]).includes(sp.status) ? sp.status : undefined;
  const sort = sp.sort === "newest" ? "newest" : "oldest";
  const filters = { q: sp.q?.trim() || undefined, categoryId: Number(sp.category) || undefined };

  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
  const firstTry = Math.max(1, Number(sp.page) || 1);
  let { total, rows } = await lotPage({ user: user ?? { qcAuthorized: false }, filters, view, status, sort, page: firstTry, pageSize: PAGE_SIZE });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(firstTry, pages);
  if (page !== firstTry) ({ total, rows } = await lotPage({ user: user ?? { qcAuthorized: false }, filters, view, status, sort, page, pageSize: PAGE_SIZE }));

  const params = (extra: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const all = { q: filters.q, category: filters.categoryId, status, view, sort: sort === "newest" ? "newest" : undefined, ...extra };
    for (const [k, v] of Object.entries(all)) if (v !== undefined && v !== "") p.set(k, String(v));
    const s = p.toString();
    return s ? `/lots?${s}` : "/lots";
  };
  const filtered = !!(filters.q || filters.categoryId || status || view || sort === "newest");
  const from = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <>
      <PageHeader
        title={view ? LOT_VIEWS[view].label : "Lots"}
        actions={
          <Link href="/receive" className={buttonClass}>
            Receive delivery
          </Link>
        }
      />

      <nav aria-label="Views" className="mb-3 flex flex-wrap gap-2 text-sm">
        <ViewLink href={params({ view: undefined, page: undefined })} active={!view}>
          All
        </ViewLink>
        {(Object.keys(LOT_VIEWS) as LotView[]).map((v) => (
          <ViewLink key={v} href={params({ view: v, page: undefined })} active={view === v}>
            {LOT_VIEWS[v].label}
          </ViewLink>
        ))}
      </nav>

      <form className="mb-4 flex flex-wrap items-center gap-2" role="search" aria-label="Filter lots">
        {view && <input type="hidden" name="view" value={view} />}
        <input name="q" defaultValue={filters.q} placeholder="Item, item code, lot no. or REC no." aria-label="Search" className={`${inputClass} max-w-xs`} />
        <select name="category" defaultValue={filters.categoryId ?? ""} aria-label="Category" className={`${inputClass} w-auto`}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={status ?? ""} aria-label="QC status" className={`${inputClass} w-auto`}>
          <option value="">Any status</option>
          {QC_STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select name="sort" defaultValue={sort} aria-label="Sort" className={`${inputClass} w-auto`}>
          <option value="oldest">Oldest received first</option>
          <option value="newest">Newest received first</option>
        </select>
        <button className={secondaryButtonClass}>Apply</button>
        {filtered && (
          <Link href="/lots" className="text-sm font-medium text-sky-700 hover:underline">
            Reset filters
          </Link>
        )}
      </form>

      <p className="mb-2 text-sm text-slate-600" aria-live="polite">
        {total ? `Showing ${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()} lots` : "No lots match."}
      </p>

      <Table
        head={["Lot", "Item", "Received", "Balance", "Status", "Next step"]}
        empty={
          rows.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-slate-500">
              No lots here.{" "}
              {filtered ? (
                <Link href="/lots" className="text-sky-700 hover:underline">
                  Reset filters
                </Link>
              ) : (
                <Link href="/receive" className="text-sky-700 hover:underline">
                  Receive the first delivery
                </Link>
              )}
            </p>
          )
        }
      >
        {rows.map(({ lot, wf }) => (
          <tr key={lot.id} className="align-top hover:bg-slate-50">
            <td className="px-4 py-2">
              <Link href={`/lots/${lot.id}`} className="font-mono font-medium text-sky-700 hover:underline">
                {lotLabel(lot)}
              </Link>
              <div className="text-xs text-slate-500">{lot.receipt.receivingNo}</div>
            </td>
            <td className="px-4 py-2">
              {lot.item.name}
              <div className="font-mono text-xs text-slate-500">
                {lot.item.code} · {lot.item.category.name}
              </div>
            </td>
            <td className="whitespace-nowrap px-4 py-2">{formatDate(lot.receipt.dateReceived)}</td>
            <td className="px-4 py-2 tabular-nums">
              {wf.balance.toLocaleString()}
              <div className="text-xs text-slate-500">of {lot.qtyReceived.toLocaleString()}</div>
            </td>
            <td className="px-4 py-2">
              <QcStatusBadge status={lot.qcStatus} />
              <div className="mt-0.5 text-xs text-slate-600">{STAGE_LABELS[wf.stage]}</div>
            </td>
            <td className="px-4 py-2">
              {wf.current.canDo && wf.current.href ? (
                <Link href={wf.current.href} className="font-medium text-sky-700 hover:underline">
                  {wf.current.label}
                </Link>
              ) : (
                <span className="text-slate-600">{wf.current.label}</span>
              )}
              {wf.current.blocker && <div className="text-xs text-amber-800">{wf.current.blocker}</div>}
            </td>
          </tr>
        ))}
      </Table>

      {pages > 1 && (
        <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-2 text-sm">
          {page > 1 ? (
            <Link href={params({ page: page - 1 })} className={secondaryButtonClass} rel="prev">
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-slate-600">
            Page {page} of {pages.toLocaleString()}
          </span>
          {page < pages ? (
            <Link href={params({ page: page + 1 })} className={secondaryButtonClass} rel="next">
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}

function ViewLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full border px-3 py-1 ${active ? "border-sky-700 bg-sky-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
    >
      {children}
    </Link>
  );
}
