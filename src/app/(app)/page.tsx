import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { ownerOfOpen } from "@/lib/completeness";
import { itemChecklist, supplierChecklist } from "@/lib/records";
import { QUEUES, type QueueKey } from "@/lib/workflow";
import { QUEUE_KEYS, queueCounts, queueEntries, type ListFilters, type QueueEntry } from "@/lib/work-queries";
import { buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { HomeTour } from "@/components/home-tour";

// Home = "What needs my attention, and what can I do next?"
// One active queue at a time, at most 10 entries, counted and filtered in the database.
// Lots (the full list) and lot details (the full record) take over from here.

const PAGE = 10;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ tour?: string; queue?: string; q?: string; category?: string; show?: string }>;
}) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/welcome?step=who");

  const filters: ListFilters = { q: sp.q?.trim() || undefined, categoryId: Number(sp.category) || undefined };
  const [counts, categories] = await Promise.all([queueCounts(user, filters), prisma.category.findMany({ orderBy: { name: "asc" } })]);

  // default: the first queue with work this user can do, else the first with any work
  const requested = QUEUE_KEYS.find((k) => k === sp.queue);
  const queue: QueueKey =
    requested ?? QUEUE_KEYS.find((k) => counts[k].mine > 0) ?? QUEUE_KEYS.find((k) => counts[k].total > 0) ?? "inspection";
  // "For you" (what this user can act on) by default when there is any; "All" includes work waiting on others
  const mine = sp.show === "all" ? false : sp.show === "mine" ? true : counts[queue].mine > 0;
  const entries = await queueEntries(queue, user, filters, PAGE, mine);
  const total = counts[queue].total;
  const shown = mine ? counts[queue].mine : total;

  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: filters.q, category: filters.categoryId ? String(filters.categoryId) : undefined, ...extra }))
      if (v) p.set(k, v);
    return p.toString();
  };
  const viewAll = `/lots?${qs({ view: QUEUES[queue].lotsView })}`;
  const filtered = !!(filters.q || filters.categoryId);
  const startTour = sp.tour === "1" || !user.tourCompletedAt;

  return (
    <>
      <header data-tour="actions" className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">My work</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/receive" className={buttonClass}>
            Receive delivery
          </Link>
          <Link href="/lots?view=usage" className={secondaryButtonClass}>
            Record usage
          </Link>
        </div>
      </header>

      {/* Queue selector: task counts per queue (a lot can be in more than one) */}
      <nav data-tour="queues" aria-label="Work queues" className="mb-4">
        <ul className="flex flex-wrap gap-2">
          {QUEUE_KEYS.map((k) => {
            const active = k === queue;
            const c = counts[k];
            return (
              <li key={k}>
                <Link
                  href={`/?${qs({ queue: k })}`}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-baseline gap-2 rounded-lg border px-3 py-2 text-sm ${
                    active ? "border-sky-700 bg-sky-50 text-sky-900" : "border-slate-200 bg-white text-slate-700 hover:border-sky-400"
                  }`}
                >
                  <span className="font-medium">{QUEUES[k].label}</span>
                  <span className="text-base font-semibold tabular-nums">{c.total}</span>
                  <span className="text-xs text-slate-500">{c.mine} for you</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="mt-1 text-xs text-slate-500">Counts are tasks; one lot can appear in several queues.</p>
      </nav>

      <form className="mb-3 flex flex-wrap items-center gap-2" role="search" aria-label="Filter the queue">
        <input type="hidden" name="queue" value={queue} />
        <input name="q" defaultValue={filters.q} placeholder="Item, item code or lot no." aria-label="Search" className={`${inputClass} max-w-xs`} />
        <select name="category" defaultValue={filters.categoryId ?? ""} aria-label="Category" className={`${inputClass} max-w-[16rem]`}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button className={secondaryButtonClass}>Apply</button>
        {filtered && (
          <Link href={`/?${new URLSearchParams({ queue })}`} className="text-sm font-medium text-sky-700 hover:underline">
            Clear filters
          </Link>
        )}
      </form>

      <section data-tour="worklist" aria-labelledby="queue-title" className="mb-8">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 id="queue-title" className="text-sm font-semibold text-slate-700">
            {QUEUES[queue].label}
          </h2>
          <div role="group" aria-label="Show" className="flex overflow-hidden rounded-md border border-slate-300 text-sm">
            {[
              { key: "mine", label: `For you (${counts[queue].mine})`, active: mine },
              { key: "all", label: `All (${total})`, active: !mine },
            ].map((o) => (
              <Link
                key={o.key}
                href={`/?${qs({ queue, show: o.key })}`}
                aria-current={o.active ? "true" : undefined}
                className={`px-3 py-1 ${o.active ? "bg-sky-700 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
              >
                {o.label}
              </Link>
            ))}
          </div>
        </div>
        {entries.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-600">
            {filtered
              ? "No lots match these filters in this queue."
              : mine && total > 0
                ? `Nothing for you right now — ${total} waiting on others.`
                : `Nothing in ${QUEUES[queue].label.toLowerCase()}.`}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white shadow-sm">
            {entries.map((e) => (
              <QueueRow key={e.lotId} entry={e} />
            ))}
          </ul>
        )}
        {total > 0 && (
          <p className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
            <span>
              Showing {entries.length} of {shown.toLocaleString()}
              {mine ? " you can act on" : ""} · oldest received first
            </span>
            <Link href={viewAll} className="font-medium text-sky-700 hover:underline">
              View all {total.toLocaleString()} in Lots →
            </Link>
          </p>
        )}
      </section>

      <MasterDataSection qcAuthorized={user.qcAuthorized} />

      <HomeTour key={sp.tour === "1" ? "again" : "auto"} start={startTour} />
    </>
  );
}

function daysAgo(d: Date) {
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  return days <= 0 ? "received today" : days === 1 ? "received 1 day ago" : `received ${days} days ago`;
}

function QueueRow({ entry: e }: { entry: QueueEntry }) {
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

// Item and supplier records: not lot work, so collapsed below the queue. Item
// requirements that block a lot (e.g. a spec sheet) already appear in the lot queues.
async function MasterDataSection({ qcAuthorized }: { qcAuthorized: boolean }) {
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
  if (!records.length) return null;
  return (
    <details className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-slate-700">
        Item and supplier records to complete <span className="font-normal text-slate-500">({records.length})</span>
      </summary>
      <ul className="divide-y divide-slate-100 border-t border-slate-100 text-sm">
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
    </details>
  );
}
