import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { LOT_INCLUDE, lotLabel, lotStatus } from "@/lib/records";
import { loadTodos, todosForUser, type Todo } from "@/lib/todos";
import { Badge, Card, formatDate } from "@/components/ui";
import { CompletionBar } from "@/components/progress";
import { HomeTour } from "@/components/home-tour";

// Home = task hub (spec §5): what do I do next? Big actions, my to-do list, lots on hold.

// Everyone can open all four. `qcDecision`: the final sign-off there needs QC authorization.
const ACTIONS = [
  { key: "receive", href: "/receive", title: "Receive a delivery", text: "Step-by-step receiving. Lots go to Quarantine." },
  { key: "usage", href: "/lots?view=usage", title: "Record usage", text: "Take released stock into production, samples…" },
  {
    key: "inspect",
    href: "/lots?view=inspect",
    title: "Inspect a lot",
    text: "F.WD.003 incoming inspection with the sampling plan.",
    qcDecision: true,
  },
  {
    key: "release",
    href: "/lots?view=release",
    title: "Release a lot",
    text: "Lots whose inspection passed and paperwork is complete.",
    qcDecision: true,
  },
];

export default async function HomePage({ searchParams }: { searchParams: Promise<{ tour?: string }> }) {
  const { tour } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/welcome?step=who");
  const [todos, quarantine, releasedWithStock] = await Promise.all([
    loadTodos(),
    prisma.lot.findMany({
      where: { qcStatus: "Quarantine" },
      include: LOT_INCLUDE,
      orderBy: [{ receipt: { dateReceived: "asc" } }, { id: "asc" }],
    }),
    prisma.lot.findMany({ where: { qcStatus: "Released" }, include: { transactions: { select: { qty: true } } } }),
  ]);

  const quarantineRows = quarantine.map((lot) => ({ lot, ...lotStatus(lot) }));
  const counts: Record<string, number> = {
    inspect: quarantineRows.filter((r) => !r.lastInspection).length,
    release: quarantineRows.filter((r) => r.progress.next === "release").length,
    usage: releasedWithStock.filter((l) => l.transactions.reduce((s, t) => s + t.qty, 0) > 0).length,
  };
  const mine = todosForUser(todos, user);
  // First visit for this user, or "Show tour again" (?tour=1).
  const startTour = tour === "1" || !user.tourCompletedAt;

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Hi {user.name.split(" ")[0]} — what do you want to do?</h1>
        <p className="mt-1 text-sm text-slate-600">Receive → Quarantine → Inspect (F.WD.003) → Release → Use</p>
      </div>

      <div data-tour="actions" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ACTIONS.map((a) => {
          const count = counts[a.key];
          return (
            <Link
              key={a.key}
              href={a.href}
              className="group flex min-h-32 flex-col justify-between rounded-xl border-2 border-sky-700 bg-sky-700 p-5 text-white shadow-sm transition hover:bg-sky-800 hover:shadow-md"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-lg font-semibold">{a.title}</span>
                  {count !== undefined && count > 0 && (
                    <span className="rounded-full bg-white px-2 py-0.5 text-sm font-semibold tabular-nums text-sky-800">{count}</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-sky-100">{a.text}</p>
                {a.qcDecision && !user.qcAuthorized && <p className="mt-2 text-xs text-sky-200">Sign-off requires QC authorization</p>}
              </div>
              <span className="mt-3 text-sm font-medium">Start →</span>
            </Link>
          );
        })}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-5">
        <div data-tour="todo" className="lg:col-span-3">
          <Card
            className="h-full"
            title={
              <span className="flex items-center gap-2">
                My to-do
                <Badge tone={mine.length ? "amber" : "green"}>{mine.length}</Badge>
                <span className="text-sm font-normal text-slate-500">
                  · {user.qcAuthorized ? "includes QC decisions" : "QC decisions are listed for QC-authorized users"}
                </span>
              </span>
            }
          >
            {mine.length === 0 ? <p className="text-sm text-emerald-700">Nothing waiting for you. 🎉</p> : <TodoList todos={mine} />}
          </Card>
        </div>

        <div data-tour="quarantine" className="lg:col-span-2">
          <Card title={`Lots in quarantine (${quarantineRows.length})`} className="h-full">
            {quarantineRows.length === 0 ? (
              <p className="text-sm text-slate-500">
                Nothing on hold.{" "}
                <Link href="/receive" className="text-sky-700 hover:underline">
                  Receive a delivery
                </Link>
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {quarantineRows.map(({ lot, summary, progress }) => (
                  <li key={lot.id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/lots/${lot.id}`} className="font-mono font-medium text-sky-700 hover:underline">
                          {lotLabel(lot)}
                        </Link>
                        <div className="truncate text-xs text-slate-500">
                          {lot.item.code} · {lot.receipt.receivingNo} · {formatDate(lot.receipt.dateReceived)}
                        </div>
                      </div>
                      <CompletionBar summary={summary} compact />
                    </div>
                    <div className="mt-1 text-sm text-slate-700">Next: {progress.nextLabel}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
      <HomeTour key={tour === "1" ? "again" : "auto"} start={startTour} />
    </>
  );
}

function TodoList({ todos }: { todos: Todo[] }) {
  const shown = todos.slice(0, 25);
  return (
    <>
      <ul className="divide-y divide-slate-100">
        {shown.map((t) => (
          <li key={t.key}>
            <Link href={t.href} className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 hover:bg-slate-50">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${t.kind === "missing" ? "bg-amber-400" : t.kind === "reject" ? "bg-red-500" : "bg-sky-600"}`}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-900">{t.title}</span>
                <span className="block truncate text-xs text-slate-500">{t.context}</span>
              </span>
              {t.ref && (
                <span className="hidden rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600 sm:inline">{t.ref}</span>
              )}
              {t.owner === "qc" && <Badge tone="green">QC</Badge>}
              <span className="text-sm font-medium text-sky-700">Go →</span>
            </Link>
          </li>
        ))}
      </ul>
      {todos.length > shown.length && <p className="mt-2 text-xs text-slate-500">…and {todos.length - shown.length} more.</p>}
    </>
  );
}
