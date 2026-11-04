import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { categoryLabel } from "@/lib/category-config";
import { QUEUES } from "@/lib/workflow";
import { QUEUE_KEYS, queueCounts, queueEntries, type ListFilters } from "@/lib/work-queries";
import { countsDue, countsDueTotal, missingDocuments } from "@/lib/overview";
import { plural } from "@/lib/text";
import { PageHeader, formatDate, inputClass, secondaryButtonClass } from "@/components/ui";
import { QueueRow, RecordsList, daysAgo, recordsToComplete } from "@/components/task-list";

// Tasks: everything that needs doing, grouped by type, with filters. The lot queues are
// counted and filtered in the database (workflow cache); each group shows the oldest first.

const TYPES = [
  { key: "inspection", label: QUEUES.inspection.label },
  { key: "release", label: QUEUES.release.label },
  { key: "followup", label: QUEUES.followup.label },
  { key: "documents", label: "Missing documents" },
  { key: "count", label: "Monthly count due" },
  { key: "records", label: "Item and supplier records" },
] as const;
type TaskType = (typeof TYPES)[number]["key"];

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; q?: string; category?: string; show?: string }>;
}) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/welcome?step=who");

  const filters: ListFilters = { q: sp.q?.trim() || undefined, categoryId: Number(sp.category) || undefined };
  const only = TYPES.find((t) => t.key === sp.type)?.key;
  const mine = sp.show !== "all"; // "For you" by default: what this user can act on now
  const take = only ? 50 : 10;
  const want = (t: TaskType) => !only || only === t;

  const [categories, counts, docs, countTotal, counted, records] = await Promise.all([
    prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    queueCounts(user, filters),
    missingDocuments(filters),
    countsDueTotal(filters),
    want("count") ? countsDue(filters, take) : Promise.resolve([]),
    // item / supplier records are not lot work: the lot filters do not apply to them
    want("records") ? recordsToComplete() : Promise.resolve([]),
  ]);
  const entries = Object.fromEntries(
    await Promise.all(QUEUE_KEYS.map(async (k) => [k, want(k) ? await queueEntries(k, user, filters, take, mine) : []] as const)),
  );
  const total: Record<TaskType, number> = {
    inspection: mine ? counts.inspection.mine : counts.inspection.total,
    release: mine ? counts.release.mine : counts.release.total,
    followup: mine ? counts.followup.mine : counts.followup.total,
    documents: docs.length,
    count: countTotal,
    records: records.length,
  };

  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const base = { type: only, q: filters.q, category: filters.categoryId ? String(filters.categoryId) : undefined, show: mine ? undefined : "all" };
    for (const [k, v] of Object.entries({ ...base, ...extra })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/tasks?${s}` : "/tasks";
  };
  const filtered = !!(filters.q || filters.categoryId);
  const lotsLink = (k: keyof typeof QUEUES) =>
    `/lots?${new URLSearchParams({ view: QUEUES[k].lotsView, ...(filters.q ? { q: filters.q } : {}), ...(filters.categoryId ? { category: String(filters.categoryId) } : {}) })}`;

  return (
    <>
      <PageHeader title="Tasks" subtitle="Everything that needs doing, grouped by type — oldest first." />

      <form className="mb-3 flex flex-wrap items-center gap-2" role="search" aria-label="Filter tasks">
        {only && <input type="hidden" name="type" value={only} />}
        {!mine && <input type="hidden" name="show" value="all" />}
        <input name="q" defaultValue={filters.q} placeholder="Item, item code or lot no." aria-label="Search" className={`${inputClass} max-w-xs`} />
        <select name="category" defaultValue={filters.categoryId ?? ""} aria-label="Category" className={`${inputClass} max-w-[16rem]`}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {categoryLabel(c)}
            </option>
          ))}
        </select>
        <button className={secondaryButtonClass}>Apply</button>
        {filtered && (
          <Link href={qs({ q: undefined, category: undefined })} className="text-sm font-medium text-sky-700 hover:underline">
            Clear filters
          </Link>
        )}
      </form>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Task types">
          <ul className="flex flex-wrap gap-2 text-sm">
            <li>
              <TypeLink href={qs({ type: undefined })} active={!only} label="All" />
            </li>
            {TYPES.map((t) => (
              <li key={t.key}>
                <TypeLink href={qs({ type: t.key })} active={only === t.key} label={t.label} count={total[t.key]} />
              </li>
            ))}
          </ul>
        </nav>
        <div role="group" aria-label="Show" className="flex overflow-hidden rounded-md border border-slate-300 text-sm">
          {[
            { key: undefined, label: "For you", active: mine },
            { key: "all", label: "All", active: !mine },
          ].map((o) => (
            <Link
              key={o.label}
              href={qs({ show: o.key })}
              aria-current={o.active ? "true" : undefined}
              className={`px-3 py-1 ${o.active ? "bg-sky-700 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              {o.label}
            </Link>
          ))}
        </div>
      </div>
      <p className="-mt-3 mb-5 text-xs text-slate-500">
        {mine ? "For you: lot tasks you can act on now." : "All: including tasks waiting on someone else."} One lot can appear in several groups.
      </p>

      <div className="space-y-8">
        {QUEUE_KEYS.filter(want).map((k) => (
          <Group key={k} title={QUEUES[k].label} count={total[k]} more={total[k] > entries[k].length ? { href: lotsLink(k), label: `View all ${total[k].toLocaleString()} in Lots →` } : undefined}>
            {entries[k].length ? (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white shadow-sm">
                {entries[k].map((e) => (
                  <QueueRow key={e.lotId} entry={e} />
                ))}
              </ul>
            ) : (
              <Empty>
                {mine && counts[k].total > 0
                  ? `Nothing for you right now — ${counts[k].total} waiting on others.`
                  : filtered
                    ? "No lots match these filters."
                    : `Nothing in ${QUEUES[k].label.toLowerCase()}.`}
              </Empty>
            )}
          </Group>
        ))}

        {want("documents") && (
          <Group title="Missing documents" count={docs.length}>
            {docs.length ? (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm shadow-sm">
                {docs.slice(0, take).map((d) => (
                  <li key={d.lotId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
                    <span className="min-w-0">
                      <Link href={`/lots/${d.lotId}`} className="font-semibold text-slate-900 hover:underline">
                        {d.itemName}
                      </Link>{" "}
                      <span className="font-mono text-xs text-slate-500">{d.itemCode}</span>
                      <span className="text-slate-600">
                        {" "}
                        · Lot <span className="font-mono">{d.lotLabel}</span>
                      </span>
                      <span className="block text-xs text-slate-600">
                        Missing: {d.documents.join(", ")} · {daysAgo(d.dateReceived)}
                      </span>
                    </span>
                    <Link href={`/lots/${d.lotId}?tab=documents`} className={`${secondaryButtonClass} px-3 py-1.5`}>
                      Upload documents
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>{filtered ? "No lots match these filters." : "No quarantined lot is missing a document."}</Empty>
            )}
          </Group>
        )}

        {want("count") && (
          <Group title="Monthly count due" count={countTotal} note="Released lots with stock and no count recorded this month.">
            {counted.length ? (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm shadow-sm">
                {counted.map((c) => (
                  <li key={c.lotId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
                    <span className="min-w-0">
                      <Link href={`/lots/${c.lotId}`} className="font-semibold text-slate-900 hover:underline">
                        {c.itemName}
                      </Link>{" "}
                      <span className="font-mono text-xs text-slate-500">{c.itemCode}</span>
                      <span className="text-slate-600">
                        {" "}
                        · Lot <span className="font-mono">{c.lotLabel}</span>
                      </span>
                      <span className="block text-xs text-slate-600">
                        {c.balance} on record · {c.location} · {c.lastCounted ? `last counted ${formatDate(c.lastCounted)}` : "never counted"}
                      </span>
                    </span>
                    <Link href={`/lots/${c.lotId}?do=count`} className={`${secondaryButtonClass} px-3 py-1.5`}>
                      Record count
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>{filtered ? "No lots match these filters." : "Every released lot has been counted this month."}</Empty>
            )}
            {countTotal > counted.length && counted.length > 0 && (
              <p className="mt-2 text-right text-sm">
                <Link href={qs({ type: "count" })} className="font-medium text-sky-700 hover:underline">
                  Show up to 50 →
                </Link>
              </p>
            )}
          </Group>
        )}

        {want("records") && (
          <Group title="Item and supplier records" count={records.length} note="Records with missing information or documents.">
            {records.length ? <RecordsList records={records} qcAuthorized={user.qcAuthorized} /> : <Empty>Every item and supplier record is complete.</Empty>}
          </Group>
        )}
      </div>
    </>
  );
}

function TypeLink({ href, active, label, count }: { href: string; active: boolean; label: string; count?: number }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-baseline gap-1.5 rounded-full border px-3 py-1 ${
        active ? "border-sky-700 bg-sky-50 text-sky-900" : "border-slate-200 bg-white text-slate-700 hover:border-sky-400"
      }`}
    >
      {label}
      {count !== undefined && <span className="font-semibold tabular-nums">{count.toLocaleString()}</span>}
    </Link>
  );
}

function Group({ title, count, note, more, children }: { title: string; count: number; note?: string; more?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-1 flex items-baseline gap-2 text-base font-semibold">
        {title} <span className="text-sm font-normal text-slate-500">{plural(count, "task")}</span>
      </h2>
      {note && <p className="mb-2 text-xs text-slate-500">{note}</p>}
      <div className={note ? "" : "mt-2"}>{children}</div>
      {more && (
        <p className="mt-2 text-right text-sm">
          <Link href={more.href} className="font-medium text-sky-700 hover:underline">
            {more.label}
          </Link>
        </p>
      )}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-600">{children}</p>;
}
