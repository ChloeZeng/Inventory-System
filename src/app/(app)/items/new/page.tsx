import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { parseCategoryConfig } from "@/lib/category-config";
import { getCurrentUser } from "@/lib/current-user";
import { Card, PageHeader } from "@/components/ui";
import { ItemForm } from "../item-form";
import { createItem } from "../actions";

export default async function NewItemPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category: categoryParam } = await searchParams;
  const user = await getCurrentUser();
  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
  const category = categories.find((c) => c.id === Number(categoryParam));

  // Step 1: what kind of item?
  if (!category) {
    return (
      <>
        <PageHeader title="New item" subtitle="What kind of item is this?" back={{ href: "/items", label: "Items" }} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/items/new?category=${c.id}`}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-sky-400 hover:shadow"
            >
              <div className="font-medium">{c.name}</div>
              <div className="font-mono text-sm text-slate-500">{c.codePrefix}-###</div>
            </Link>
          ))}
        </div>
      </>
    );
  }

  // Step 2: specs. The item code is assigned on save.
  const config = parseCategoryConfig(category.config);
  const existingCount = await prisma.item.count({ where: { categoryId: category.id, active: true } });

  return (
    <>
      <PageHeader
        title={`New item — ${category.name}`}
        subtitle={`A code like ${category.codePrefix}-### is assigned automatically when you save.`}
        back={{ href: "/items/new", label: "Change category" }}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          {!user ? (
            <p className="text-sm text-amber-700">Pick a user in the top bar before creating items.</p>
          ) : (
            <ItemForm action={createItem} specFields={config.specFields} categoryId={category.id} />
          )}
        </Card>
        <Card title="Before you create a new code">
          <p className="text-sm text-slate-600">
            There {existingCount === 1 ? "is" : "are"} already <strong>{existingCount}</strong> active{" "}
            {category.name.toLowerCase()} item{existingCount === 1 ? "" : "s"}.{" "}
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
