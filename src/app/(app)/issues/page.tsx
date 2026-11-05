import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { plural } from "@/lib/text";
import { PageHeader, Table, buttonClass, formatDate } from "@/components/ui";
import { IssueStatusBadge } from "@/components/issue-status-badge";

// Material issues (usage forms for production runs). Open ones wait for confirmation.
const FILTERS = [
  { key: "open", label: "Waiting for confirmation" },
  { key: "confirmed", label: "Confirmed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All" },
] as const;

export default async function IssuesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status: raw } = await searchParams;
  const status = FILTERS.find((f) => f.key === raw)?.key ?? "open";
  const issues = await prisma.materialIssue.findMany({
    where: status === "all" ? {} : { status },
    include: { createdBy: true, _count: { select: { lines: true } } },
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: 200,
  });
  return (
    <>
      <PageHeader
        title="Material issues"
        subtitle="Usage forms for production runs: pick list first, quantities confirmed after production."
        actions={
          <Link href="/issues/new" className={buttonClass}>
            New material issue
          </Link>
        }
      />
      <nav aria-label="Status" className="mb-3">
        <ul className="flex flex-wrap gap-2 text-sm">
          {FILTERS.map((f) => (
            <li key={f.key}>
              <Link
                href={`/issues?status=${f.key}`}
                aria-current={status === f.key ? "page" : undefined}
                className={`block rounded-full border px-3 py-1 ${status === f.key ? "border-sky-700 bg-sky-50 text-sky-900" : "border-slate-200 bg-white text-slate-700 hover:border-sky-400"}`}
              >
                {f.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <Table
        head={["Issue no.", "Product", "Batch no.", "Production date", "Lines", "Status", "Created by"]}
        empty={issues.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-500">No material issues here.</p>}
      >
        {issues.map((i) => (
          <tr key={i.id} className="hover:bg-slate-50">
            <td className="px-4 py-2 font-mono">
              <Link href={`/issues/${i.id}`} className="text-sky-700 hover:underline">
                {i.issueNo}
              </Link>
            </td>
            <td className="px-4 py-2">
              {i.product}
              {i.client && <div className="text-xs text-slate-500">{i.client}</div>}
            </td>
            <td className="px-4 py-2 font-mono">{i.batchNo}</td>
            <td className="whitespace-nowrap px-4 py-2">{formatDate(i.date)}</td>
            <td className="px-4 py-2">{plural(i._count.lines, "line")}</td>
            <td className="px-4 py-2">
              <IssueStatusBadge status={i.status} />
            </td>
            <td className="px-4 py-2">{i.createdBy.name}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
