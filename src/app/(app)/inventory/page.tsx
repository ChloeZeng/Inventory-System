import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { inventoryRows, inventoryState, preferenceKey } from "@/lib/inventory-view";
import { plural } from "@/lib/text";
import { InventoryFiltersForm, InventoryTable } from "./inventory-client";

// Inventory: stock by item or by lot, one tab per category. Columns start from the category's
// defaults; the column picker and the filters are remembered per user (per view and tab).
// Available counts released lots only; quarantine stock is shown beside it.

const PAGE_SIZE = 50;

type Params = Record<string, string | undefined>;

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/welcome?step=who");
  const get = (k: string) => sp[k] ?? null;
  const s = await inventoryState(user.id, { get });

  const page = Math.max(1, Number(sp.page) || 1);
  const { total, rows } = await inventoryRows({ view: s.view, category: s.category, q: s.q, filters: s.filters, page, pageSize: PAGE_SIZE });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const [locations, owners] = await Promise.all([
    prisma.location.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.item.findMany({ where: { active: true }, distinct: ["owner"], select: { owner: true }, orderBy: { owner: "asc" } }),
  ]);

  const categoryId = s.category?.id ?? null;
  // the current view's query, for paging, the view toggle and the export (filters spelled out)
  const current = new URLSearchParams({
    ...(categoryId ? { category: String(categoryId) } : {}),
    ...(s.view === "lot" ? { view: "lot" } : {}),
    ...(s.q ? { q: s.q } : {}),
    f: "1",
    ...Object.fromEntries(
      Object.entries({ location: s.filters.location, owner: s.filters.owner, stock: s.filters.stock, status: s.filters.status, exp: s.filters.expiringDays })
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)]),
    ),
  });
  const withPage = (p: number) => {
    const q = new URLSearchParams(current);
    q.set("page", String(p));
    return `/inventory?${q}`;
  };
  const tabHref = (id: number | null) => `/inventory?${new URLSearchParams({ ...(id ? { category: String(id) } : {}), ...(s.view === "lot" ? { view: "lot" } : {}) })}`;
  const viewHref = (v: "item" | "lot") => `/inventory?${new URLSearchParams({ ...(categoryId ? { category: String(categoryId) } : {}), ...(v === "lot" ? { view: "lot" } : {}) })}`;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
          <p className="mt-1 text-sm text-slate-600">Available counts released lots only; quarantine stock cannot be used until QC releases it.</p>
        </div>
        <div role="group" aria-label="View" className="flex overflow-hidden rounded-md border border-slate-300 text-sm">
          {(["item", "lot"] as const).map((v) => (
            <Link
              key={v}
              href={viewHref(v)}
              aria-current={s.view === v ? "true" : undefined}
              className={`px-3 py-1.5 ${s.view === v ? "bg-sky-700 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              {v === "item" ? "By item" : "By lot"}
            </Link>
          ))}
        </div>
      </div>

      <nav aria-label="Categories" className="mb-4 overflow-x-auto border-b border-slate-200">
        <ul className="-mb-px flex gap-1 whitespace-nowrap text-sm">
          {[{ id: null as number | null, name: "All", formNo: null as string | null }, ...s.categories].map((c) => {
            const active = categoryId === c.id;
            return (
              <li key={c.id ?? "all"}>
                <Link
                  href={tabHref(c.id)}
                  title={c.formNo ?? undefined}
                  aria-current={active ? "page" : undefined}
                  className={`block border-b-2 px-3 py-2 font-medium ${active ? "border-sky-700 text-sky-800" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"}`}
                >
                  {c.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <InventoryFiltersForm
        key={current.toString()}
        view={s.view}
        categoryId={categoryId}
        q={s.q}
        filters={s.filters}
        locations={locations}
        owners={owners.map((o) => o.owner)}
        prefKey={preferenceKey(s.view, categoryId, "filters")}
      />

      <p className="mb-2 text-sm text-slate-600" aria-live="polite">
        {plural(total, s.view === "lot" ? "lot" : "item")}
        {pages > 1 && ` · page ${page} of ${pages}`}
      </p>

      <InventoryTable
        key={`${s.view}:${categoryId ?? "all"}`}
        view={s.view}
        options={s.options}
        defaults={s.defaults}
        initialColumns={s.columns}
        rows={rows}
        prefKey={preferenceKey(s.view, categoryId, "columns")}
        exportQuery={current.toString()}
      />

      {pages > 1 && (
        <nav aria-label="Pages" className="mt-3 flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={withPage(page - 1)} className="font-medium text-sky-700 hover:underline">
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          {page < pages && (
            <Link href={withPage(page + 1)} className="font-medium text-sky-700 hover:underline">
              Next →
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
