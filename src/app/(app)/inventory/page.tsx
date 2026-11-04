import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { categoryLabel, type InventoryColumn } from "@/lib/category-config";
import { inventoryCell, inventoryColumns, stockByItem } from "@/lib/inventory";
import { plural } from "@/lib/text";
import { PageHeader, Table, inputClass, secondaryButtonClass } from "@/components/ui";

// Inventory: stock per item. Filtered to one category it uses that category's columns
// (Category.config.inventoryColumns); across all categories a common set. Available counts
// released lots only; quarantine stock is shown apart.

const PAGE_SIZE = 50;

const ALL_COLUMNS: InventoryColumn[] = [
  { key: "name", label: "Name" },
  { key: "category", label: "Category" },
  { key: "owner", label: "Owner / dedicated product" },
  { key: "location", label: "Location" },
  { key: "available", label: "Available" },
];

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string; stock?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const categories = await prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const category = categories.find((c) => c.id === Number(sp.category)) ?? null;
  const q = sp.q?.trim() ?? "";
  const inStock = sp.stock === "1";

  const where: Prisma.ItemWhereInput = {
    active: true,
    ...(category ? { categoryId: category.id } : {}),
    ...(q
      ? { OR: [{ code: { contains: q } }, { name: { contains: q } }, { specs: { contains: q } }, { owner: { contains: q } }, { dedicatedProduct: { contains: q } }] }
      : {}),
    // "in stock": any released or quarantined lot with a balance
    ...(inStock ? { lots: { some: { qcStatus: { in: ["Released", "Quarantine"] }, wfBalance: { gt: 0 } } } } : {}),
  };
  const total = await prisma.item.count({ where });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(sp.page) || 1), pages);
  const items = await prisma.item.findMany({
    where,
    include: { category: true },
    orderBy: [{ category: { sortOrder: "asc" } }, { code: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  const stock = await stockByItem(items.map((i) => i.id));
  const base = category ? inventoryColumns(category) : ALL_COLUMNS;
  // quarantine stock is always shown next to what is available
  const columns = [...base, ...(base.some((c) => c.key === "quarantine") ? [] : [{ key: "quarantine", label: "Quarantine" }])];

  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ category: category ? String(category.id) : undefined, q: q || undefined, stock: inStock ? "1" : undefined, ...extra }))
      if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/inventory?${s}` : "/inventory";
  };

  return (
    <>
      <PageHeader
        title={category ? `Inventory — ${categoryLabel(category)}` : "Inventory"}
        subtitle="Available counts released lots only. Stock in quarantine cannot be used until QC releases it."
        actions={
          <Link href="/lots" className={secondaryButtonClass}>
            All lots
          </Link>
        }
      />

      <nav aria-label="Categories" className="mb-3 overflow-x-auto">
        <ul className="flex gap-1 whitespace-nowrap text-sm">
          {[{ id: null as number | null, label: "All" }, ...categories.map((c) => ({ id: c.id, label: categoryLabel(c) }))].map((c) => {
            const active = (category?.id ?? null) === c.id;
            return (
              <li key={c.id ?? "all"}>
                <Link
                  href={qs({ category: c.id ? String(c.id) : undefined, page: undefined })}
                  aria-current={active ? "page" : undefined}
                  className={`block rounded-full border px-3 py-1 ${active ? "border-sky-700 bg-sky-50 text-sky-900" : "border-slate-200 bg-white text-slate-700 hover:border-sky-400"}`}
                >
                  {c.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <form className="mb-3 flex flex-wrap items-center gap-2" role="search" aria-label="Filter inventory">
        {category && <input type="hidden" name="category" value={category.id} />}
        <input name="q" defaultValue={q} placeholder="Code, name, size, owner, product…" aria-label="Search" className={`${inputClass} max-w-xs`} />
        <label className="flex items-center gap-1 text-sm text-slate-600">
          <input type="checkbox" name="stock" value="1" defaultChecked={inStock} /> In stock only
        </label>
        <button className={secondaryButtonClass}>Apply</button>
      </form>

      <p className="mb-2 text-sm text-slate-600" aria-live="polite">
        {plural(total, "item")}
        {pages > 1 && ` · page ${page} of ${pages}`}
      </p>

      <Table head={["Code", ...columns.map((c) => c.label)]} empty={items.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-500">No items match.</p>}>
        {items.map((i) => {
          const s = stock.get(i.id)!;
          return (
            <tr key={i.id} className="hover:bg-slate-50">
              <td className="whitespace-nowrap px-4 py-2">
                <Link href={`/items/${i.id}`} className="font-mono font-medium text-sky-700 hover:underline">
                  {i.code}
                </Link>
              </td>
              {columns.map((c) => {
                const value = c.key === "category" ? categoryLabel(i.category) : inventoryCell(c, i, s);
                const numeric = c.key === "available" || c.key === "quarantine";
                const zero = numeric && /^0 /.test(value);
                return (
                  <td key={c.key} className={`px-4 py-2 ${numeric ? "whitespace-nowrap tabular-nums" : ""} ${zero ? "text-slate-400" : c.key === "available" ? "font-medium" : "text-slate-700"}`}>
                    {value}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </Table>

      {pages > 1 && (
        <nav aria-label="Pages" className="mt-3 flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={qs({ page: String(page - 1) })} className="font-medium text-sky-700 hover:underline">
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          {page < pages && (
            <Link href={qs({ page: String(page + 1) })} className="font-medium text-sky-700 hover:underline">
              Next →
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
