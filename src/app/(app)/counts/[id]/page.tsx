import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { formatQty } from "@/lib/category-config";
import { todayDateInput } from "@/lib/forms";
import { countSheet } from "@/lib/stock-count-db";
import { countRecord } from "@/lib/stock-count-record";
import { plural } from "@/lib/text";
import { Badge, PageHeader, Table, formatDate, formatDateTime, secondaryButtonClass } from "@/components/ui";
import { AuditHistory } from "@/components/audit-history";
import { CountSheet } from "./count-sheet";
import { ClearDraft } from "./clear-draft";
import { submitCountAction } from "../actions";

export default async function CountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string }> }) {
  const id = Number((await params).id);
  const { done } = await searchParams;
  if (!Number.isInteger(id)) notFound();
  const rec = await countRecord(id);
  if (!rec) notFound();
  const { count, rows } = rec;
  const user = await getCurrentUser();
  const open = count.status === "open";
  const draftKey = `stock-count-${count.id}`;
  const title = count.kind === "monthly" ? `Monthly count ${count.period}` : "Stock count";
  const differences = rows.filter((r) => r.difference !== 0);

  return (
    <>
      <PageHeader
        back={{ href: "/counts", label: "Stock counts" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {title} <span className="font-mono text-slate-500">{count.countNo}</span>
            {open ? <Badge tone="amber">To count</Badge> : <Badge tone="green">Completed</Badge>}
          </span>
        }
        subtitle={
          open
            ? `Due ${formatDate(count.dueDate)}. Count every lot on the shelf and enter what you find; differences need a reason and are booked as count adjustments.`
            : `Counted ${formatDate(count.countDate)} · submitted by ${count.completedBy?.name ?? "—"} on ${formatDateTime(count.completedAt!)} · ${plural(rows.length, "lot")}, ${plural(differences.length, "difference")}`
        }
        actions={
          !open && (
            <>
              <a href={`/counts/${count.id}/export?format=xlsx`} className={secondaryButtonClass}>
                Export Excel
              </a>
              <a href={`/counts/${count.id}/export?format=csv`} className={secondaryButtonClass}>
                Export CSV
              </a>
            </>
          )
        }
      />

      {open ? (
        user ? (
          <CountSheet action={submitCountAction.bind(null, count.id)} groups={await countSheet(prisma)} today={todayDateInput()} draftKey={draftKey} />
        ) : (
          <p className="text-sm text-amber-700">Pick a user first.</p>
        )
      ) : (
        <>
          <ClearDraft draftKey={draftKey} />
          {done && (
            <p role="status" className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              ✓ Count submitted. {differences.length ? `${plural(differences.length, "count adjustment")} booked.` : "No differences."} The count is saved below and can be exported.
            </p>
          )}
          {count.notes && <p className="mb-4 text-sm text-slate-600">Notes: {count.notes}</p>}
          <Table head={["Category · location", "Item", "Lot", "System qty", "Counted", "Difference", "Reason"]}>
            {rows.map((r) => (
              <tr key={r.lineId} className={r.difference ? "bg-amber-50/60" : ""}>
                <td className="px-4 py-2 text-slate-600">
                  {r.category}
                  <span className="block text-xs">{r.location}</span>
                </td>
                <td className="px-4 py-2">
                  <span className="font-mono text-xs">{r.itemCode}</span> {r.itemName}
                </td>
                <td className="px-4 py-2 font-mono">
                  <Link href={`/lots/${r.lotId}`} className="text-sky-700 hover:underline">
                    {r.lot}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-4 py-2 tabular-nums">{formatQty(r.systemQty, r.unit)}</td>
                <td className="whitespace-nowrap px-4 py-2 tabular-nums">{formatQty(r.countedQty, r.unit)}</td>
                <td className={`whitespace-nowrap px-4 py-2 tabular-nums ${r.difference ? "font-semibold text-amber-900" : "text-slate-500"}`}>
                  {r.difference === 0 ? "0" : `${r.difference > 0 ? "+" : "−"}${formatQty(Math.abs(r.difference), r.unit)}`}
                </td>
                <td className="px-4 py-2 text-slate-700">{r.reason || "—"}</td>
              </tr>
            ))}
          </Table>
        </>
      )}

      <h2 className="mb-3 mt-8 text-base font-semibold">Audit history</h2>
      <AuditHistory
        scopes={[
          { table: "StockCount", ids: [count.id] },
          { table: "StockCountLine", ids: rows.map((r) => r.lineId) },
          { table: "InventoryTransaction", ids: rows.flatMap((r) => (r.transactionId ? [r.transactionId] : [])) },
        ]}
      />
    </>
  );
}
