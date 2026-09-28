import { prisma } from "@/lib/prisma";
import { Table, formatDateTime } from "@/components/ui";

export async function AuditHistory({ table, recordId }: { table: string; recordId: number | string }) {
  const rows = await prisma.auditLog.findMany({
    where: { tableName: table, recordId: String(recordId) },
    include: { user: true },
    orderBy: [{ at: "desc" }, { id: "desc" }],
  });
  return (
    <Table
      head={["When", "Who", "Action", "Field", "Old", "New", "Reason"]}
      empty={rows.length === 0 && <p className="px-4 py-3 text-sm text-slate-500">No history yet.</p>}
    >
      {rows.map((r) => (
        <tr key={r.id} className="align-top">
          <td className="whitespace-nowrap px-4 py-2 text-slate-600">{formatDateTime(r.at)}</td>
          <td className="px-4 py-2">{r.user?.initials ?? "system"}</td>
          <td className="px-4 py-2">{r.action}</td>
          <td className="px-4 py-2 font-mono text-xs">{r.field}</td>
          <td className="max-w-xs break-words px-4 py-2 text-slate-500">{r.oldValue}</td>
          <td className="max-w-xs break-words px-4 py-2">{r.newValue}</td>
          <td className="px-4 py-2 text-slate-600">{r.reason}</td>
        </tr>
      ))}
    </Table>
  );
}
