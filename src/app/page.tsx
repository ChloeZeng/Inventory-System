import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/ui";

export default async function HomePage() {
  const [items, suppliers, unapproved, missingSpecSheet] = await Promise.all([
    prisma.item.count({ where: { active: true } }),
    prisma.supplier.count({ where: { active: true } }),
    prisma.supplier.count({ where: { active: true, aslApproved: false } }),
    prisma.item.count({ where: { active: true, documents: { none: { type: "Spec sheet" } } } }),
  ]);

  const tiles = [
    { href: "/items", label: "Active items", value: items },
    { href: "/items", label: "Items missing a spec sheet", value: missingSpecSheet },
    { href: "/suppliers", label: "Active suppliers", value: suppliers },
    { href: "/suppliers?asl=no", label: "Suppliers not ASL approved", value: unapproved },
  ];

  return (
    <>
      <PageHeader title="SVLSG Inventory" subtitle="Receive → Quarantine → Inspect (F.WD.003) → Release / Reject → Use" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href}>
            <Card className="hover:border-sky-400">
              <div className="text-3xl font-semibold tabular-nums">{t.value}</div>
              <div className="mt-1 text-sm text-slate-600">{t.label}</div>
            </Card>
          </Link>
        ))}
      </div>
      <p className="mt-8 text-sm text-slate-500">
        Prototype build steps 1–2: master data (items, suppliers). Receiving, lot detail, inspection, release, usage and export come next.
      </p>
    </>
  );
}
