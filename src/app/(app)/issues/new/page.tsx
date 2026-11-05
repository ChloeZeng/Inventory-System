import { prisma } from "@/lib/prisma";
import { pickableItems } from "@/lib/material-issue-db";
import { todayDateInput } from "@/lib/forms";
import { PageHeader } from "@/components/ui";
import { IssueForm } from "./issue-form";

// New material issue (usage form for a production run).
export default async function NewIssuePage() {
  const [items, dedicated, used, owners] = await Promise.all([
    pickableItems(prisma),
    prisma.item.findMany({ where: { dedicatedProduct: { not: null } }, distinct: ["dedicatedProduct"], select: { dedicatedProduct: true } }),
    prisma.materialIssue.findMany({ distinct: ["product"], select: { product: true }, take: 200 }),
    prisma.item.findMany({ where: { owner: { not: "SVLSG" } }, distinct: ["owner"], select: { owner: true } }),
  ]);
  const products = [...new Set([...dedicated.map((d) => d.dedicatedProduct!), ...used.map((u) => u.product)])].sort();
  return (
    <>
      <PageHeader
        title="New material issue"
        subtitle="Materials for one production run. Only released lots can be picked; the suggested lot comes first."
        back={{ href: "/issues", label: "Material issues" }}
      />
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-600">No released stock is available to pick.</p>
      ) : (
        <IssueForm items={items} products={products} clients={owners.map((o) => o.owner).sort()} today={todayDateInput()} />
      )}
    </>
  );
}
