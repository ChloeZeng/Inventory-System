import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { categoryLabel } from "@/lib/category-config";
import { itemChecklist } from "@/lib/records";
import { WarningIcon } from "@/components/warning-icon";
import { Badge, PageHeader, Table, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; inactive?: string }>;
}) {
  const { q = "", category = "", inactive } = await searchParams;
  const categories = await prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const items = await prisma.item.findMany({
    where: {
      ...(category ? { categoryId: Number(category) } : {}),
      ...(inactive ? {} : { active: true }),
      ...(q
        ? {
            OR: [
              { code: { contains: q } },
              { name: { contains: q } },
              { legacyCode: { contains: q } },
              { specs: { contains: q } },
              { owner: { contains: q } },
              { dedicatedProduct: { contains: q } },
            ],
          }
        : {}),
    },
    include: {
      category: true,
      documents: { select: { type: true } },
    },
    orderBy: [{ category: { sortOrder: "asc" } }, { code: "asc" }],
  });

  return (
    <>
      <PageHeader
        title="Items"
        subtitle="One item per item type — never per batch. New batches of an existing item are received against the same code."
        actions={
          <Link href="/items/new" className={buttonClass}>
            New item
          </Link>
        }
      />

      <form className="mb-4 flex flex-wrap items-center gap-2">
        <input name="q" defaultValue={q} placeholder="Search code, name, size, owner, product…" className={`${inputClass} max-w-xs`} />
        <select name="category" defaultValue={category} className={`${inputClass} w-auto`}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {categoryLabel(c)}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-sm text-slate-600">
          <input type="checkbox" name="inactive" defaultChecked={!!inactive} /> Show inactive
        </label>
        <button className={secondaryButtonClass}>Filter</button>
      </form>

      <Table
        head={["Code", "Name", "Owner / dedicated product", "Spec sheet"]}
        empty={items.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-500">No items match.</p>}
      >
        {items.map((i) => (
          <tr key={i.id} className="hover:bg-slate-50">
            <td className="px-4 py-2">
              <Link href={`/items/${i.id}`} className="font-mono font-medium text-sky-700 hover:underline">
                {i.code}
              </Link>
              {/* only an incomplete record is flagged */}
              {(() => {
                const c = itemChecklist(i);
                return c.complete ? null : <WarningIcon text={`Record incomplete — missing: ${c.open.map((r) => r.req.label).join(", ")}`} />;
              })()}
              {i.legacyCode && <div className="font-mono text-xs text-slate-500">{i.legacyCode}</div>}
            </td>
            <td className="px-4 py-2">
              {i.name} {!i.active && <Badge>inactive</Badge>}
            </td>
            <td className="px-4 py-2 text-slate-600">
              {i.owner}
              {i.dedicatedProduct && <div className="text-xs text-slate-500">for {i.dedicatedProduct}</div>}
            </td>
            <td className="px-4 py-2">
              {i.documents.some((d) => d.type === "Spec sheet") ? <Badge tone="green">on file</Badge> : <Badge tone="amber">missing</Badge>}
            </td>

          </tr>
        ))}
      </Table>
    </>
  );
}
