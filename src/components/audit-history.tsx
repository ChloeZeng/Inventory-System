import { loadAuditEvents } from "@/lib/audit-format";
import { Table, formatDateTime } from "@/components/ui";

// Audit trail readable by an auditor: names not IDs, one row per save, empty values hidden.
// `scopes` lists every record that belongs on this page (e.g. a lot, its receipt and its documents).
export async function AuditHistory({ scopes }: { scopes: { table: string; ids: (number | string)[] }[] }) {
  const events = await loadAuditEvents(scopes);
  return (
    <Table
      head={["When", "Who", "What", "Details", "Reason"]}
      empty={events.length === 0 && <p className="px-4 py-3 text-sm text-slate-500">No history yet.</p>}
    >
      {events.map((ev) => (
        <tr key={ev.key} className="align-top">
          <td className="whitespace-nowrap px-4 py-2 text-slate-600">{formatDateTime(ev.at)}</td>
          <td className="whitespace-nowrap px-4 py-2">{ev.who}</td>
          <td className="px-4 py-2">
            <span className="font-medium">{ev.action}</span> <span className="text-slate-600">{ev.record}</span>
          </td>
          <td className="px-4 py-2">
            <ul className="space-y-0.5">
              {ev.changes.map((c, i) => (
                <li key={i} className="break-words">
                  <span className="text-slate-500">{c.label}:</span>{" "}
                  {ev.action === "Changed" ? (
                    <>
                      <span className="text-slate-500">{c.old ?? "(empty)"}</span>
                      {" → "}
                      <span>{c.new ?? "(empty)"}</span>
                    </>
                  ) : (
                    <span>{c.new ?? c.old}</span>
                  )}
                </li>
              ))}
            </ul>
          </td>
          <td className="px-4 py-2 text-slate-600">{ev.reason}</td>
        </tr>
      ))}
    </Table>
  );
}
