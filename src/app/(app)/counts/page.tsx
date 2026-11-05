import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ensureMonthlyCounts } from "@/lib/stock-count-db";
import { nextCountDate } from "@/lib/stock-count";
import { todayDateInput } from "@/lib/forms";
import { Badge, PageHeader, Table, buttonClass, formatDate, secondaryButtonClass } from "@/components/ui";
import { startCountAction } from "./actions";

// Stock counts: the monthly count (a task from the last working day of each month) and any
// count started by hand. Completed counts are kept as records and can be exported.
export default async function CountsPage() {
  await ensureMonthlyCounts(prisma);
  const counts = await prisma.stockCount.findMany({
    include: { completedBy: true, _count: { select: { lines: true } }, lines: { where: { difference: { not: 0 } }, select: { id: true } } },
    orderBy: [{ status: "desc" }, { dueDate: "desc" }, { id: "desc" }],
    take: 200,
  });
  const open = counts.filter((c) => c.status === "open");

  return (
    <>
      <PageHeader
        title="Stock counts"
        subtitle={`Every lot with stock is counted once a month, from the last working day of the month (next: ${formatDate(new Date(`${nextCountDate(todayDateInput())}T00:00:00Z`))}).`}
        actions={
          <form action={startCountAction}>
            <button className={open.length ? secondaryButtonClass : buttonClass}>Start a count now</button>
          </form>
        }
      />
      <Table
        head={["Count no.", "Type", "Due", "Status", "Lots", "Differences", "Completed", ""]}
        empty={counts.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-500">No counts yet.</p>}
      >
        {counts.map((c) => (
          <tr key={c.id} className="hover:bg-slate-50">
            <td className="px-4 py-2 font-mono">
              <Link href={`/counts/${c.id}`} className="text-sky-700 hover:underline">
                {c.countNo}
              </Link>
            </td>
            <td className="px-4 py-2">{c.kind === "monthly" ? `Monthly (${c.period})` : "Ad hoc"}</td>
            <td className="whitespace-nowrap px-4 py-2">{formatDate(c.dueDate)}</td>
            <td className="px-4 py-2">{c.status === "open" ? <Badge tone="amber">To count</Badge> : <Badge tone="green">Completed</Badge>}</td>
            <td className="px-4 py-2 tabular-nums">{c.status === "open" ? "—" : c._count.lines}</td>
            <td className="px-4 py-2 tabular-nums">{c.status === "open" ? "—" : c.lines.length}</td>
            <td className="whitespace-nowrap px-4 py-2">{c.completedAt ? `${formatDate(c.countDate)} · ${c.completedBy?.name ?? "—"}` : "—"}</td>
            <td className="whitespace-nowrap px-4 py-2 text-right">
              {c.status === "open" ? (
                <Link href={`/counts/${c.id}`} className={`${buttonClass} px-3 py-1.5`}>
                  Count
                </Link>
              ) : (
                <span className="flex justify-end gap-3 text-sm">
                  <a href={`/counts/${c.id}/export?format=xlsx`} className="font-medium text-sky-700 hover:underline">
                    Excel
                  </a>
                  <a href={`/counts/${c.id}/export?format=csv`} className="font-medium text-sky-700 hover:underline">
                    CSV
                  </a>
                </span>
              )}
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}
