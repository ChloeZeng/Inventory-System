import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { formatQty, itemUnit } from "@/lib/category-config";
import { lotLabel } from "@/lib/records";
import { Card, PageHeader, Table, formatDate, formatDateTime, secondaryButtonClass } from "@/components/ui";
import { AuditHistory } from "@/components/audit-history";
import { IssueStatusBadge } from "@/components/issue-status-badge";
import { CancelIssueForm, ConfirmIssueForm } from "./issue-forms";
import { cancelIssueAction, confirmIssueAction } from "../actions";

export default async function IssuePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; done?: string }> }) {
  const id = Number((await params).id);
  const { created, done } = await searchParams;
  if (!Number.isInteger(id)) notFound();
  const issue = await prisma.materialIssue.findUnique({
    where: { id },
    include: {
      createdBy: true,
      confirmedBy: true,
      cancelledBy: true,
      lines: {
        include: { item: { include: { category: true } }, lot: { include: { location: true } }, transactions: { select: { id: true } } },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!issue) notFound();
  const user = await getCurrentUser();
  const open = issue.status === "open";
  const confirmed = issue.status === "confirmed";

  return (
    <>
      <PageHeader
        back={{ href: "/issues", label: "Material issues" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            Material issue <span className="font-mono">{issue.issueNo}</span> <IssueStatusBadge status={issue.status} />
          </span>
        }
        subtitle={
          <>
            {issue.product}
            {issue.client && ` · ${issue.client}`} · batch <span className="font-mono">{issue.batchNo}</span> · production date {formatDate(issue.date)}
          </>
        }
        actions={
          issue.status !== "cancelled" && (
            <a href={`/print/issues/${issue.id}`} target="_blank" className={secondaryButtonClass}>
              Print pick list
            </a>
          )
        }
      />

      {done === "confirmed" && confirmed && (
        <p role="status" className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          ✓ Confirmed — lot balances updated. Each line now shows in its item&apos;s Usage tab.
        </p>
      )}
      {done === "cancelled" && issue.status === "cancelled" && (
        <p role="status" className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          ✓ Cancelled — the reserved quantities are free again.
        </p>
      )}
      {created && open && (
        <p role="status" className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          ✓ Saved. The quantities are reserved. Print the pick list for production, then confirm the actual quantities after the run.
        </p>
      )}

      <div className="mb-6 grid gap-4 text-sm sm:grid-cols-3">
        <Info label="Created">
          {issue.createdBy.name} · {formatDateTime(issue.createdAt)}
        </Info>
        {confirmed && (
          <Info label="Confirmed">
            {issue.confirmedBy?.name} · {formatDateTime(issue.confirmedAt!)}
            {issue.confirmNote && <span className="block text-slate-600">Note: {issue.confirmNote}</span>}
          </Info>
        )}
        {issue.status === "cancelled" && (
          <Info label="Cancelled">
            {issue.cancelledBy?.name} · {formatDateTime(issue.cancelledAt!)}
            <span className="block text-slate-600">Reason: {issue.cancelReason}</span>
          </Info>
        )}
        {issue.notes && <Info label="Notes">{issue.notes}</Info>}
      </div>

      <h2 className="mb-2 text-base font-semibold">Materials</h2>
      <Table head={["#", "Item", "Lot", "Location", "Planned", ...(confirmed ? ["Actual used", "Loss", "Returned"] : [])]}>
        {issue.lines.map((l) => {
          const unit = itemUnit(l.item);
          return (
            <tr key={l.id}>
              <td className="px-4 py-2 text-slate-500">{l.sortOrder}</td>
              <td className="px-4 py-2">
                <Link href={`/items/${l.itemId}`} className="font-mono text-sky-700 hover:underline">
                  {l.item.code}
                </Link>{" "}
                {l.item.name}
                {l.productReason && (
                  <span className="block text-xs text-amber-800">
                    Dedicated to {l.item.dedicatedProduct} — reason: {l.productReason}
                  </span>
                )}
              </td>
              <td className="px-4 py-2 font-mono">
                <Link href={`/lots/${l.lotId}`} className="text-sky-700 hover:underline">
                  {lotLabel(l.lot)}
                </Link>
              </td>
              <td className="px-4 py-2">{l.lot.location.name}</td>
              <td className="whitespace-nowrap px-4 py-2 tabular-nums">{formatQty(l.plannedQty, unit)}</td>
              {confirmed && (
                <>
                  <td className="whitespace-nowrap px-4 py-2 tabular-nums">{formatQty(l.actualQty ?? 0, unit)}</td>
                  <td className="whitespace-nowrap px-4 py-2 tabular-nums">{formatQty(l.lossQty ?? 0, unit)}</td>
                  <td className="whitespace-nowrap px-4 py-2 tabular-nums">{formatQty(l.returnedQty ?? 0, unit)}</td>
                </>
              )}
            </tr>
          );
        })}
      </Table>

      {open && user && (
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <Card title="Confirm after production" className="lg:col-span-2">
            <p className="mb-4 text-sm text-slate-600">
              Enter what was actually used, lost and returned to stock for each line. Confirming takes the used and lost quantities out of the lots.
            </p>
            <ConfirmIssueForm
              action={confirmIssueAction.bind(null, issue.id)}
              lines={issue.lines.map((l) => ({ id: l.id, label: `${l.item.code} ${l.item.name}`, lot: lotLabel(l.lot), planned: l.plannedQty, unit: itemUnit(l.item) }))}
            />
          </Card>
          <Card title="Cancel" className="self-start">
            <CancelIssueForm action={cancelIssueAction.bind(null, issue.id)} />
          </Card>
        </div>
      )}

      <h2 className="mb-3 mt-8 text-base font-semibold">Audit history</h2>
      <AuditHistory
        scopes={[
          { table: "MaterialIssue", ids: [issue.id] },
          { table: "MaterialIssueLine", ids: issue.lines.map((l) => l.id) },
          { table: "InventoryTransaction", ids: issue.lines.flatMap((l) => l.transactions.map((t) => t.id)) },
        ]}
      />
    </>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
