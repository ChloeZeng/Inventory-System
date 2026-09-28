import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { parseCategoryConfig, parseSpecs, formatSpecs } from "@/lib/category-config";
import { itemChecklist } from "@/lib/records";
import { CompletionBar } from "@/components/progress";
import { Badge, PageHeader, Table, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; inactive?: string }>;
}) {
  const { q = "", category = "", inactive } = await searchParams;
  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
  const items = await prisma.item.findMany({
    where: {
      ...(category ? { categoryId: Number(category) } : {}),
      ...(inactive ? {} : { active: true }),
      ...(q
        ? { OR: [{ code: { contains: q } }, { name: { contains: q } }, { legacyCode: { contains: q } }, { specs: { contains: q } }] }
        : {}),
    },
    include: {
      category: true,
      documents: { select: { type: true } },
      _count: { select: { lots: true } },
    },
    orderBy: { code: "asc" },
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
        <input name="q" defaultValue={q} placeholder="Search code, name, size, color…" className={`${inputClass} max-w-xs`} />
        <select name="category" defaultValue={category} className={`${inputClass} w-auto`}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.codePrefix})
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-sm text-slate-600">
          <input type="checkbox" name="inactive" defaultChecked={!!inactive} /> Show inactive
        </label>
        <button className={secondaryButtonClass}>Filter</button>
      </form>

      <Table
        head={["Code", "Name", "Category", "Specs", "Spec sheet", "Complete", "Lots"]}
        empty={items.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-500">No items match.</p>}
      >
        {items.map((i) => (
          <tr key={i.id} className="hover:bg-slate-50">
            <td className="px-4 py-2">
              <Link href={`/items/${i.id}`} className="font-mono font-medium text-sky-700 hover:underline">
                {i.code}
              </Link>
              {i.legacyCode && <div className="font-mono text-xs text-slate-500">{i.legacyCode}</div>}
            </td>
            <td className="px-4 py-2">
              {i.name} {!i.active && <Badge>inactive</Badge>}
            </td>
            <td className="px-4 py-2 text-slate-600">{i.category.name}</td>
            <td className="px-4 py-2 text-slate-600">{formatSpecs(parseCategoryConfig(i.category.config), parseSpecs(i.specs)) || "—"}</td>
            <td className="px-4 py-2">
              {i.documents.some((d) => d.type === "Spec sheet") ? <Badge tone="green">on file</Badge> : <Badge tone="amber">missing</Badge>}
            </td>
            <td className="px-4 py-2">
              <CompletionBar summary={itemChecklist(i)} compact />
            </td>
            <td className="px-4 py-2 tabular-nums">{i._count.lots}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
