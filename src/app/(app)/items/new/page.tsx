import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { categoryLabel, itemCodePrefix, parseCategoryConfig } from "@/lib/category-config";
import { getCurrentUser } from "@/lib/current-user";
import { plural } from "@/lib/text";
import { Card, PageHeader } from "@/components/ui";
import { ItemForm } from "../item-form";
import { createItem } from "../actions";

const choiceClass = "rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-sky-400 hover:shadow";

export default async function NewItemPage({ searchParams }: { searchParams: Promise<{ category?: string; subType?: string }> }) {
  const { category: categoryParam, subType: subTypeParam } = await searchParams;
  const user = await getCurrentUser();
  const categories = await prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const category = categories.find((c) => c.id === Number(categoryParam));

  // Step 1: what kind of item?
  if (!category) {
    return (
      <>
        <PageHeader title="New item" subtitle="What kind of item is this?" back={{ href: "/items", label: "Items" }} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => {
            const config = parseCategoryConfig(c.config);
            return (
              <Link key={c.id} href={`/items/new?category=${c.id}`} className={choiceClass}>
                <div className="font-medium">{categoryLabel(c)}</div>
                <div className="font-mono text-sm text-slate-500">
                  {config.subTypes.length ? config.subTypes.map((t) => `${t.codePrefix}-###`).join(" / ") : `${c.codePrefix}-###`}
                </div>
              </Link>
            );
          })}
        </div>
      </>
    );
  }

  const config = parseCategoryConfig(category.config);
  const prefix = itemCodePrefix(category, config, subTypeParam);

  // Step 1b (categories with sub-types, e.g. Silica): the answer decides the code prefix.
  if (!prefix) {
    return (
      <>
        <PageHeader
          title={`New item — ${categoryLabel(category)}`}
          subtitle={`${config.subTypes.map((t) => t.label).join(" or ")}?`}
          back={{ href: "/items/new", label: "Change category" }}
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
          {config.subTypes.map((t) => (
            <Link key={t.key} href={`/items/new?category=${category.id}&subType=${t.key}`} className={choiceClass}>
              <div className="font-medium">{t.label}</div>
              <div className="font-mono text-sm text-slate-500">{t.codePrefix}-###</div>
            </Link>
          ))}
        </div>
      </>
    );
  }

  // Step 2: description and owner. The item code is assigned on save.
  const subType = config.subTypes.find((t) => t.key === subTypeParam);
  const [existingCount, suppliers] = await Promise.all([
    prisma.item.count({ where: { categoryId: category.id, active: true, ...(subType ? { subType: subType.key } : {}) } }),
    prisma.supplier.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const kind = subType ? `${category.name.toLowerCase()} ${subType.label.toLowerCase()}` : category.name.toLowerCase();

  return (
    <>
      <PageHeader
        title={`New item — ${categoryLabel(category)}${subType ? ` (${subType.label.toLowerCase()})` : ""}`}
        subtitle={`A code like ${prefix}-### is assigned automatically when you save.`}
        back={{ href: subType ? `/items/new?category=${category.id}` : "/items/new", label: subType ? "Change type" : "Change category" }}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          {!user ? (
            <p className="text-sm text-amber-700">Pick a user in the top bar before creating items.</p>
          ) : (
            <ItemForm action={createItem} specFields={config.specFields} suppliers={suppliers} categoryId={category.id} subType={subType?.key} />
          )}
        </Card>
        <Card title="Before you create a new code">
          <p className="text-sm text-slate-600">
            There {existingCount === 1 ? "is" : "are"} already <strong>{plural(existingCount, `active ${kind} item`)}</strong>.{" "}
            <Link href={`/items?category=${category.id}`} className="text-sky-700 hover:underline">
              Check the list
            </Link>{" "}
            — a new batch of an existing item must use the existing code.
          </p>
        </Card>
      </div>
    </>
  );
}
