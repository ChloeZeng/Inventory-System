import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { categoryLabel, formatQty, itemUnit } from "@/lib/category-config";
import { lotLabel } from "@/lib/records";
import { searchWhere } from "@/lib/work-queries";
import { plural } from "@/lib/text";
import { PageHeader, Table, buttonClass, formatDate, inputClass, secondaryButtonClass } from "@/components/ui";

// "Record usage" (top-right button): pick the released lot the stock comes from, then the
// lot page opens its usage form. Only released lots with stock can be used. Lots expiring
// first are listed first (first expiry, first out).

const PAGE_SIZE = 25;

export default async function UsagePickerPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; page?: string }> }) {
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const categoryId = Number(sp.category) || undefined;
  const categories = await prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const where = { AND: [searchWhere({ q, categoryId }), { qcStatus: "Released", wfBalance: { gt: 0 } }] };
  const total = await prisma.lot.count({ where });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(sp.page) || 1), pages);
  const lots = await prisma.lot.findMany({
    where,
    include: { item: { include: { category: true } }, location: true, receipt: true },
    // SQLite sorts empty expiry dates first; lots with a date come in date order
    orderBy: [{ expDate: { sort: "asc", nulls: "last" } }, { receipt: { dateReceived: "asc" } }, { id: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  const qs = (p: number) => `/usage?${new URLSearchParams({ ...(q ? { q } : {}), ...(categoryId ? { category: String(categoryId) } : {}), page: String(p) })}`;

  return (
    <>
      <PageHeader
        title="Record usage"
        subtitle="Which lot is the stock taken from? Only released lots with stock are listed — the ones expiring first at the top."
        actions={
          <>
            <Link href="/issues" className={secondaryButtonClass}>
              Material issues
            </Link>
            <Link href="/issues/new" className={buttonClass}>
              Production run (several items)
            </Link>
          </>
        }
      />

      <form className="mb-3 flex flex-wrap items-center gap-2" role="search" aria-label="Find a lot">
        <input name="q" defaultValue={q} placeholder="Item, item code or lot no." aria-label="Search" className={`${inputClass} max-w-xs`} autoFocus />
        <select name="category" defaultValue={categoryId ?? ""} aria-label="Category" className={`${inputClass} max-w-[16rem]`}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {categoryLabel(c)}
            </option>
          ))}
        </select>
        <button className={secondaryButtonClass}>Find</button>
      </form>
      <p className="mb-2 text-sm text-slate-600">{plural(total, "released lot")} with stock</p>

      <Table
        head={["Item", "Lot", "Location", "Expiry", "On hand", ""]}
        empty={lots.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-500">No released lot with stock matches.</p>}
      >
        {lots.map((l) => (
          <tr key={l.id} className="hover:bg-slate-50">
            <td className="px-4 py-2">
              {l.item.name}
              <div className="font-mono text-xs text-slate-500">{l.item.code}</div>
            </td>
            <td className="px-4 py-2 font-mono">
              <Link href={`/lots/${l.id}`} className="text-sky-700 hover:underline">
                {lotLabel(l)}
              </Link>
            </td>
            <td className="px-4 py-2 text-slate-700">{l.location.name}</td>
            <td className="whitespace-nowrap px-4 py-2 text-slate-700">{formatDate(l.expDate)}</td>
            <td className="whitespace-nowrap px-4 py-2 tabular-nums">{formatQty(l.wfBalance, itemUnit(l.item))}</td>
            <td className="px-4 py-2 text-right">
              <Link href={`/lots/${l.id}?do=usage`} className={`${buttonClass} whitespace-nowrap px-3 py-1.5`}>
                Record usage
              </Link>
            </td>
          </tr>
        ))}
      </Table>
      {pages > 1 && (
        <nav aria-label="Pages" className="mt-3 flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={qs(page - 1)} className="font-medium text-sky-700 hover:underline">
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-slate-500">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link href={qs(page + 1)} className="font-medium text-sky-700 hover:underline">
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
