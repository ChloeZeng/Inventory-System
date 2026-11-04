import { prisma } from "@/lib/prisma";
import { categoryLabel, codePatterns, itemSettings, parseCategoryConfig } from "@/lib/category-config";
import { testPathLabel } from "@/lib/constants";
import { STAGE_LABELS } from "@/lib/completeness";
import { Card, PageHeader } from "@/components/ui";

// Settings → Categories: the category settings as stored (Category row + config). Read-only
// for now; they are data, so editing them later needs no code change.

export default async function CategoriesPage() {
  const categories = await prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { items: true } } } });

  return (
    <>
      <PageHeader title="Categories" subtitle="Settings for each inventory category. Read-only for now — they are stored as data and can be made editable." />
      <div className="space-y-4">
        {categories.map((c) => {
          const config = parseCategoryConfig(c.config);
          const kinds = config.subTypes.length ? config.subTypes.map((t) => ({ label: t.label, s: itemSettings(c, t.key) })) : [{ label: null, s: itemSettings(c) }];
          return (
            <Card key={c.id} title={categoryLabel(c)}>
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <Def label="Item codes">
                  <span className="font-mono">{codePatterns(c, config).join(" / ")}</span>
                </Def>
                <Def label="Items">{c._count.items}</Def>
                <Def label="Description fields">{config.specFields.map((f) => `${f.label}${f.required ? "" : " (optional)"}`).join(", ") || "—"}</Def>
                <Def label="Inventory columns">{config.inventoryColumns.map((col) => col.label).join(", ") || "—"}</Def>
              </dl>
              <div className="mt-4 space-y-3">
                {kinds.map(({ label, s }) => (
                  <div key={label ?? "all"} className="rounded-md border border-slate-200 p-3 text-sm">
                    {label && <p className="mb-1 font-semibold">{label}</p>}
                    <p className="text-slate-700">
                      Unit <strong>{s.unit}</strong> · Testing <strong>{testPathLabel(s.testPath) ?? "—"}</strong>
                      {s.inspectionChecklist.length > 0 && ` · F.WD.003 checklist (${s.inspectionChecklist.length} questions)`}
                    </p>
                    {(["at_receiving", "before_release"] as const).map((stage) => (
                      <p key={stage} className="mt-1 text-xs text-slate-600">
                        <span className="font-medium text-slate-700">{STAGE_LABELS[stage]}:</span> {s.requirements[stage].map((r) => r.label).join(", ") || "—"}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}

function Def({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-medium">{children}</dd>
    </div>
  );
}
