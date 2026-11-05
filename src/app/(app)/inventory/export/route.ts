import { getCurrentUser } from "@/lib/current-user";
import { categoryLabel } from "@/lib/category-config";
import { exportTable, inventoryRows, inventoryState } from "@/lib/inventory-view";
import { toCsv, toXlsx } from "@/lib/spreadsheet";

// Export the current Inventory view (same category, view, search, filters and columns as on
// screen — the page passes its columns in cols=) as CSV or Excel. All rows, not one page.
const MAX_ROWS = 10_000;

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Pick a user first.", { status: 401 });
  const params = new URL(req.url).searchParams;
  const s = await inventoryState(user.id, params);
  const { rows } = await inventoryRows({ view: s.view, category: s.category, q: s.q, filters: s.filters, pageSize: MAX_ROWS });
  const columns = s.options.filter((o) => s.columns.includes(o.key));
  const { header, body } = exportTable(s.view, columns, rows);

  const stamp = new Date().toISOString().slice(0, 10);
  const name = `inventory-${s.view === "lot" ? "lots" : "items"}-${s.category ? s.category.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") : "all"}-${stamp}`;
  if (params.get("format") === "xlsx") {
    const sheet = `${s.category ? categoryLabel(s.category) : "All categories"} ${s.view === "lot" ? "lots" : "items"}`;
    return new Response(new Uint8Array(toXlsx(sheet, header, body)), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}.xlsx"`,
      },
    });
  }
  return new Response(toCsv(header, body), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` },
  });
}
