import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatQty, itemUnit } from "@/lib/category-config";
import { lotLabel } from "@/lib/records";
import { formatDate, formatDateTime } from "@/components/ui";
import { PrintButton } from "./print-button";

// Pick list for production staff (English, printable): what to take from which lot and where,
// with space to write what was actually used, lost and returned.
export const metadata = { title: "Pick list" };

export default async function PickListPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const issue = await prisma.materialIssue.findUnique({
    where: { id },
    include: {
      createdBy: true,
      lines: { include: { item: { include: { category: true } }, lot: { include: { location: true } } }, orderBy: { sortOrder: "asc" } },
    },
  });
  if (!issue) notFound();

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-4xl p-8 text-slate-900 print:max-w-none print:p-0">
        <div className="mb-6 flex items-center justify-between gap-4 print:hidden">
          <Link href={`/issues/${issue.id}`} className="text-sm text-sky-700 hover:underline">
            ← Back to {issue.issueNo}
          </Link>
          <PrintButton />
        </div>

        <header className="mb-6 border-b-2 border-slate-900 pb-3">
          <p className="text-xs uppercase tracking-wide text-slate-600">SVLSG · Material issue · Pick list</p>
          <h1 className="mt-1 text-2xl font-bold">{issue.product}</h1>
          <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-4">
            <Def label="Batch no.">{issue.batchNo}</Def>
            <Def label="Production date">{formatDate(issue.date)}</Def>
            <Def label="Issue no.">{issue.issueNo}</Def>
            <Def label="Client">{issue.client ?? "—"}</Def>
          </dl>
          {issue.status !== "open" && <p className="mt-2 text-sm font-semibold">Status: {issue.status === "confirmed" ? "CONFIRMED" : "CANCELLED — do not pick"}</p>}
        </header>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-slate-900 text-left">
              <th className="py-2 pr-2">#</th>
              <th className="py-2 pr-2">Item</th>
              <th className="py-2 pr-2">Lot</th>
              <th className="py-2 pr-2">Location</th>
              <th className="py-2 pr-2 text-right">Quantity</th>
              <th className="py-2 pr-2 text-center">Picked ✓</th>
              <th className="py-2 pr-2">Used</th>
              <th className="py-2 pr-2">Loss</th>
              <th className="py-2">Returned</th>
            </tr>
          </thead>
          <tbody>
            {issue.lines.map((l) => (
              <tr key={l.id} className="border-b border-slate-300 align-top">
                <td className="py-3 pr-2">{l.sortOrder}</td>
                <td className="py-3 pr-2">
                  <span className="font-mono font-semibold">{l.item.code}</span>
                  <div>{l.item.name}</div>
                </td>
                <td className="py-3 pr-2">
                  <span className="font-mono font-semibold">{lotLabel(l.lot)}</span>
                  {l.lot.expDate && <div className="text-xs">Exp {formatDate(l.lot.expDate)}</div>}
                </td>
                <td className="py-3 pr-2">{l.lot.location.name}</td>
                <td className="whitespace-nowrap py-3 pr-2 text-right text-base font-semibold tabular-nums">{formatQty(l.plannedQty, itemUnit(l.item))}</td>
                <td className="py-3 pr-2 text-center">☐</td>
                <td className="py-3 pr-2">________</td>
                <td className="py-3 pr-2">________</td>
                <td className="py-3">________</td>
              </tr>
            ))}
          </tbody>
        </table>

        {issue.notes && <p className="mt-4 text-sm">Notes: {issue.notes}</p>}

        <div className="mt-10 grid grid-cols-2 gap-10 text-sm">
          <p>Picked by: _______________________ Date: ___________</p>
          <p>Checked by: ______________________ Date: ___________</p>
        </div>
        <p className="mt-8 text-xs text-slate-500">
          Prepared by {issue.createdBy.name} on {formatDateTime(issue.createdAt)}. Use only the lots listed. Write the actual quantities used, lost and returned, then confirm them in the
          inventory system.
        </p>
      </div>
    </div>
  );
}

function Def({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-600">{label}</dt>
      <dd className="font-mono font-semibold">{children}</dd>
    </div>
  );
}
