import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { QUEUES, type QueueKey } from "@/lib/workflow";
import { QUEUE_KEYS, queueCounts, queueEntries } from "@/lib/work-queries";
import { countsDueTotal, formatAvailable, missingDocuments, recentActivity, stockByCategory } from "@/lib/overview";
import { plural } from "@/lib/text";
import { formatDateTime } from "@/components/ui";
import { QueueRow } from "@/components/task-list";
import { HomeTour } from "@/components/home-tour";

// Home = an overview: stock by category, what needs doing (counts and the three most urgent),
// and what happened recently. The full task lists are on Tasks; stock detail is in Inventory.

export default async function HomePage({ searchParams }: { searchParams: Promise<{ tour?: string }> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/welcome?step=who");

  const [stock, counts, docs, countDue, activity, ...perQueue] = await Promise.all([
    stockByCategory(),
    queueCounts(user, {}),
    missingDocuments(),
    countsDueTotal(),
    recentActivity(10),
    // the three most urgent: the oldest lots this user can act on, across the queues
    ...QUEUE_KEYS.map((k) => queueEntries(k, user, {}, 3, true)),
  ]);
  const seen = new Set<number>();
  const urgent = perQueue
    .flat()
    .sort((a, b) => a.dateReceived.getTime() - b.dateReceived.getTime() || a.lotId - b.lotId)
    .filter((e) => (seen.has(e.lotId) ? false : (seen.add(e.lotId), true)))
    .slice(0, 3);

  const tile = (k: QueueKey) => ({ label: QUEUES[k].label, count: counts[k].total, sub: `${counts[k].mine} for you`, href: `/tasks?type=${k}` });
  const tiles = [
    { ...tile("inspection"), label: "To inspect" },
    tile("release"),
    { label: "Missing documents", count: docs.length, sub: plural(docs.length, "lot"), href: "/tasks?type=documents" },
    { label: "Monthly count due", count: countDue, sub: "released lots not counted this month", href: "/tasks?type=count" },
  ];
  const startTour = sp.tour === "1" || !user.tourCompletedAt;

  return (
    <>
      <h1 className="mb-5 text-2xl font-semibold tracking-tight">Home</h1>

      {/* a) Stock by category */}
      <section aria-labelledby="stock-title" className="mb-8">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 id="stock-title" className="text-base font-semibold">
            Stock by category
          </h2>
          <Link href="/inventory" className="text-sm font-medium text-sky-700 hover:underline">
            Inventory →
          </Link>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {stock.map((c) => (
            <li key={c.id} className="flex flex-col rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">{c.label}</p>
              <p className="text-xs text-slate-500">{plural(c.items, "item")}</p>
              <p className="mt-2 text-xs text-slate-500">Available</p>
              <p className="font-semibold tabular-nums">{formatAvailable(c.available)}</p>
              <p className={`mt-1 text-xs ${c.quarantineLots ? "text-amber-800" : "text-slate-500"}`}>
                {plural(c.quarantineLots, "lot")} in quarantine
              </p>
              <Link href={`/inventory?category=${c.id}`} className="mt-auto pt-2 text-sm font-medium text-sky-700 hover:underline">
                View all
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* b) Tasks: counts and the three most urgent */}
        <section aria-labelledby="tasks-title">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 id="tasks-title" className="text-base font-semibold">
              Tasks
            </h2>
            <Link href="/tasks" className="text-sm font-medium text-sky-700 hover:underline">
              All tasks →
            </Link>
          </div>
          <ul data-tour="queues" className="grid grid-cols-2 gap-3">
            {tiles.map((t) => (
              <li key={t.label}>
                <Link href={t.href} className="block h-full rounded-lg border border-slate-200 bg-white p-3 shadow-sm hover:border-sky-400">
                  <span className="block text-sm text-slate-600">{t.label}</span>
                  <span className="block text-2xl font-semibold tabular-nums">{t.count.toLocaleString()}</span>
                  <span className="block text-xs text-slate-500">{t.sub}</span>
                </Link>
              </li>
            ))}
          </ul>
          <h3 className="mb-2 mt-5 text-sm font-semibold text-slate-700">Most urgent for you</h3>
          <div data-tour="worklist">
            {urgent.length ? (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white shadow-sm">
                {urgent.map((e) => (
                  <QueueRow key={e.lotId} entry={e} />
                ))}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-600">
                Nothing for you right now.{" "}
                <Link href="/tasks?show=all" className="font-medium text-sky-700 hover:underline">
                  See all tasks
                </Link>
              </p>
            )}
          </div>
        </section>

        {/* c) Recent activity */}
        <section aria-labelledby="activity-title">
          <h2 id="activity-title" className="mb-2 text-base font-semibold">
            Recent activity
          </h2>
          {activity.length ? (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm shadow-sm">
              {activity.map((a, i) => (
                <li key={i} className="flex gap-3 px-4 py-2.5">
                  <span className={`mt-0.5 h-fit shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${KIND_TONE[a.kind] ?? "bg-slate-100 text-slate-700"}`}>{a.kind}</span>
                  <span className="min-w-0">
                    <Link href={`/lots/${a.lotId}`} className="text-slate-900 hover:underline">
                      {a.text}
                    </Link>
                    <span className="block text-xs text-slate-500">
                      {formatDateTime(a.at)} · {a.by}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-600">Nothing recorded yet.</p>
          )}
        </section>
      </div>

      <HomeTour key={sp.tour === "1" ? "again" : "auto"} start={startTour} />
    </>
  );
}

const KIND_TONE: Record<string, string> = {
  Receipt: "bg-sky-50 text-sky-800",
  Usage: "bg-slate-100 text-slate-700",
  Release: "bg-emerald-50 text-emerald-800",
  Loss: "bg-amber-50 text-amber-900",
  Scrap: "bg-amber-50 text-amber-900",
  Rejection: "bg-red-50 text-red-800",
};
