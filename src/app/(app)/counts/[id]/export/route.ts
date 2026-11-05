import { getCurrentUser } from "@/lib/current-user";
import { COUNT_EXPORT_HEADER, countExportRows, countRecord } from "@/lib/stock-count-record";
import { toCsv, toXlsx } from "@/lib/spreadsheet";

// Export a completed stock count (every counted lot, system vs counted, reasons).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return new Response("Pick a user first.", { status: 401 });
  const rec = await countRecord(Number((await params).id));
  if (!rec) return new Response("Not found", { status: 404 });
  if (rec.count.status !== "completed") return new Response("This count is not completed yet.", { status: 409 });
  const body = countExportRows(rec.rows);
  const name = `stock-count-${rec.count.countNo}`;
  if (new URL(req.url).searchParams.get("format") === "xlsx")
    return new Response(new Uint8Array(toXlsx(rec.count.countNo, COUNT_EXPORT_HEADER, body)), {
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}.xlsx"` },
    });
  return new Response(toCsv(COUNT_EXPORT_HEADER, body), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` },
  });
}
