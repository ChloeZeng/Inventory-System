import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { loadWorkQueue, type AreaStatus, type Readiness, type WorkLot, type WorkTask } from "@/lib/work-queue";
import { buttonClass, formatDate } from "@/components/ui";
import { QcAuthNote } from "@/components/qc-gate";
import { HomeTour } from "@/components/home-tour";

// Home = batch-focused work dashboard:
//   1. title + workflow   2. status summaries (filters)   3. work list grouped by lot
//   4. shortcuts           5. item / supplier records to complete (distinct from lots)

const FILTERS = {
  inspection: { label: "Awaiting inspection", hint: "Not inspected yet" },
  release: { label: "Awaiting release", hint: "Inspection approved" },
  blocked: { label: "Blocked", hint: "Release blocked by open tasks" },
} as const;
type Filter = keyof typeof FILTERS;

// Workflow order. They open lists or forms; none of them changes a lot by itself.
const SHORTCUTS = [
  { href: "/receive", label: "Receive delivery", hint: "Step-by-step receiving form" },
  { href: "/lots?view=inspect", label: "Inspect lot", hint: "Lots not yet inspected" },
  { href: "/lots?view=release", label: "Release lot", hint: "Lots ready for release review" },
  { href: "/lots?view=usage", label: "Record usage", hint: "Released lots with stock · usage entry not built yet" },
];

export default async function HomePage({ searchParams }: { searchParams: Promise<{ tour?: string; filter?: string }> }) {
  const { tour, filter: filterParam } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/welcome?step=who");

  const queue = await loadWorkQueue(user);
  const filter = (filterParam && filterParam in FILTERS ? filterParam : null) as Filter | null;
  const visible = queue.lots.filter((l) =>
    filter === "inspection" ? l.stage === "inspection" : filter === "release" ? l.stage === "release" : filter === "blocked" ? l.blocked : true,
  );
  const taskCount = visible.reduce((n, l) => n + l.tasks.length, 0);
  // First visit for this user, or "Show tour again" (?tour=1).
  const startTour = tour === "1" || !user.tourCompletedAt;

  return (
    <>
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Lots that need attention</h1>
        <p className="mt-1 text-sm text-slate-600">
          <span className="font-medium text-slate-800">Receive → Quarantine → Inspect → Release → Use.</span> A lot stays in Quarantine
          from receipt until QC releases or rejects it. Oldest deliveries are listed first.
        </p>
      </header>

      {/* 2. Status summaries — each one filters the work list */}
      <section data-tour="summary" aria-label="Status summary" className="mb-5">
        <div className="grid gap-3 sm:grid-cols-3">
          {(Object.keys(FILTERS) as Filter[]).map((f) => {
            const n = queue.counts[f];
            const active = filter === f;
            return (
              <Link
                key={f}
                href={active ? "/" : `/?filter=${f}`}
                aria-current={active ? "true" : undefined}
                className={`rounded-lg border bg-white px-4 py-3 shadow-sm transition hover:border-sky-400 ${
                  active ? "border-sky-600 ring-2 ring-sky-600/30" : "border-slate-200"
                }`}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`text-sm font-medium ${f === "blocked" && n ? "text-red-700" : "text-slate-700"}`}>{FILTERS[f].label}</span>
                  <span className="text-2xl font-semibold tabular-nums">{n}</span>
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {n === 1 ? "lot" : "lots"} · {FILTERS[f].hint}
                  {active && <span className="font-medium text-sky-700"> · filter on</span>}
                </span>
              </Link>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Blocked lots are also counted under Awaiting release, so the cards do not add up to a total.
          {queue.counts.failed > 0 &&
            ` ${queue.counts.failed} ${queue.counts.failed === 1 ? "lot has failed inspection and awaits" : "lots have failed inspection and await"} rejection.`}
        </p>
      </section>

      {/* 3. Work list, grouped by lot */}
      <section data-tour="worklist" aria-labelledby="worklist-title" className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="worklist-title" className="text-base font-semibold">
            {filter ? FILTERS[filter].label : "All lots in quarantine"}
            <span className="ml-2 font-normal text-slate-600">
              {visible.length} {visible.length === 1 ? "lot" : "lots"} · {taskCount} open {taskCount === 1 ? "task" : "tasks"}
            </span>
          </h2>
          {filter && (
            <Link href="/" className="text-sm font-medium text-sky-700 hover:underline">
              Clear filter — show all {queue.lots.length} {queue.lots.length === 1 ? "lot" : "lots"}
            </Link>
          )}
        </div>

        {queue.lots.length === 0 ? (
          <EmptyState>
            No lots are in quarantine.{" "}
            <Link href="/receive" className="font-medium text-sky-700 hover:underline">
              Receive delivery
            </Link>
          </EmptyState>
        ) : visible.length === 0 ? (
          <EmptyState>
            No lots match “{filter && FILTERS[filter].label}”.{" "}
            <Link href="/" className="font-medium text-sky-700 hover:underline">
              Clear filter
            </Link>
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {visible.map((lot) => (
              <LotEntry key={lot.lotId} lot={lot} />
            ))}
          </ul>
        )}
      </section>

      {/* 4. Shortcuts — secondary, compact, in workflow order */}
      <section data-tour="shortcuts" aria-labelledby="shortcuts-title" className="mb-8">
        <h2 id="shortcuts-title" className="mb-2 text-sm font-semibold text-slate-700">
          Shortcuts
        </h2>
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {SHORTCUTS.map((s, i) => (
            <li key={s.href}>
              <Link
                href={s.href}
                className="flex h-full items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm hover:border-sky-400"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-50 text-xs font-semibold text-sky-800" aria-hidden>
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-sky-800">{s.label}</span>
                  <span className="block text-xs text-slate-500">{s.hint}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      {/* 5. Item and supplier records — not lots, so listed apart */}
      {queue.masterData.length > 0 && (
        <section aria-labelledby="records-title" className="mb-4">
          <h2 id="records-title" className="mb-2 text-sm font-semibold text-slate-700">
            Item and supplier records to complete
            <span className="ml-2 font-normal text-slate-500">{queue.masterData.length}</span>
          </h2>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm shadow-sm">
            {queue.masterData.map((m) => (
              <li key={`${m.kind}-${m.id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2">
                <span className="min-w-0">
                  <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{m.kind === "item" ? "Item" : "Supplier"}</span>
                  <span className="font-medium">{m.title}</span>
                  <span className="block text-xs text-slate-500">Missing: {m.missing.join(", ")}</span>
                  {m.qcNote && <span className="block text-xs text-slate-500">{m.qcNote}</span>}
                </span>
                <Link href={m.href} className="text-sm font-medium text-sky-700 hover:underline">
                  {m.kind === "item" ? "Complete item record" : "Complete supplier record"}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <HomeTour key={tour === "1" ? "again" : "auto"} start={startTour} />
    </>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-600">{children}</p>;
}

const READINESS: Record<Readiness, { label: string; icon: string; cls: string }> = {
  ready: { label: "Ready", icon: "✓", cls: "border-emerald-300 bg-emerald-50 text-emerald-800" },
  blocked: { label: "Blocked", icon: "✕", cls: "border-red-300 bg-red-50 text-red-800" },
  pending: { label: "Pending", icon: "…", cls: "border-amber-300 bg-amber-50 text-amber-900" },
};

const AREA_TONE: Record<AreaStatus["tone"], string> = {
  ok: "text-emerald-800",
  open: "text-amber-800",
  bad: "text-red-700",
  neutral: "text-slate-700",
};

function LotEntry({ lot }: { lot: WorkLot }) {
  const r = READINESS[lot.readiness];
  return (
    <li className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 p-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="flex flex-wrap items-baseline gap-x-2 text-base font-semibold">
            <Link href={`/lots/${lot.lotId}`} className="hover:underline">
              {lot.itemName}
            </Link>
            <span className="font-mono text-sm font-normal text-slate-500">{lot.itemCode}</span>
          </h3>
          <p className="break-words text-sm text-slate-600">
            Lot <span className="font-mono font-medium text-slate-800">{lot.lotLabel}</span> · {lot.receivingNo} · {lot.supplierName} · received{" "}
            {formatDate(lot.dateReceived)}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 font-medium text-amber-900">Quarantine</span>
            <span className="rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 font-medium text-slate-800">{lot.stageLabel}</span>
            <span className={`rounded-full border px-2 py-0.5 font-medium ${r.cls}`}>
              <span aria-hidden>{r.icon} </span>
              {r.label}
            </span>
          </div>

          <p className="mt-2 text-sm text-slate-800">{lot.reason}</p>
          {lot.dependencyNote && <p className="mt-0.5 text-xs text-slate-600">{lot.dependencyNote}</p>}

          <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
            {lot.areas.map((a) => (
              <div key={a.label} className="flex gap-1">
                <dt className="text-slate-500">{a.label}:</dt>
                <dd className={`font-medium ${AREA_TONE[a.tone]}`}>{a.value}</dd>
              </div>
            ))}
            {lot.sampling && (
              <div className="flex gap-1">
                <dt className="sr-only">Sampling</dt>
                <dd className="text-slate-600">{lot.sampling}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-1 md:items-end">
          {lot.primary ? (
            <Link href={lot.primary.href} className={`${buttonClass} text-center`}>
              {lot.primary.label}
            </Link>
          ) : (
            <p className="max-w-56 text-sm text-slate-600 md:text-right">No action for you right now.</p>
          )}
          <Link href={`/lots/${lot.lotId}`} className="text-xs font-medium text-sky-700 hover:underline">
            Open lot details
          </Link>
        </div>
      </div>

      {lot.tasks.length > 0 && (
        <details className="group border-t border-slate-100">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden>
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.17 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
            </svg>
            <span className="group-open:hidden">Show</span>
            <span className="hidden group-open:inline">Hide</span> {lot.tasks.length} open {lot.tasks.length === 1 ? "task" : "tasks"}
            <span className="font-normal text-slate-500">— {[...new Set(lot.tasks.map((t) => t.area))].join(", ")}</span>
          </summary>
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {lot.tasks.map((t) => (
              <TaskRow key={t.key} task={t} />
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

function TaskRow({ task: t }: { task: WorkTask }) {
  return (
    <li className="flex flex-col gap-1 px-4 py-2 text-sm sm:flex-row sm:items-center sm:gap-3">
      <span className="flex shrink-0 gap-2 text-xs sm:w-44 sm:flex-col sm:gap-0">
        <span className="text-slate-500">{t.area}</span>
        <span className={`font-semibold ${t.status === "followup" ? "text-amber-800" : "text-red-700"}`}>
          {t.status === "followup" ? "Needs follow-up" : "Missing"}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        {t.canDo ? (
          <Link href={t.href} className="font-medium text-sky-700 hover:underline">
            {t.label}
          </Link>
        ) : (
          <span className="inline-flex flex-col items-start gap-0.5">
            <button type="button" disabled className="cursor-not-allowed text-left font-medium text-slate-500">
              {t.label}
            </button>
            <QcAuthNote />
          </span>
        )}
        {t.detail && <span className="block text-xs text-slate-500">{t.detail}</span>}
      </span>
      {t.ref && <span className="shrink-0 font-mono text-xs text-slate-500">{t.ref}</span>}
    </li>
  );
}
