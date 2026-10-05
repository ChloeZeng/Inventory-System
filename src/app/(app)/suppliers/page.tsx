import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { supplierTypeLabel } from "@/lib/constants";
import { supplierChecklist } from "@/lib/records";
import { CompletionBar } from "@/components/progress";
import { Badge, PageHeader, Table, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; asl?: string; inactive?: string }>;
}) {
  const { q = "", asl = "", inactive } = await searchParams;
  const suppliers = await prisma.supplier.findMany({
    where: {
      ...(q ? { OR: [{ name: { contains: q } }, { contactName: { contains: q } }] } : {}),
      ...(asl === "yes" ? { aslApproved: true } : asl === "no" ? { aslApproved: false } : {}),
      ...(inactive ? {} : { active: true }),
    },
    include: { documents: { select: { type: true } }, _count: { select: { receipts: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <PageHeader
        title="Suppliers"
        actions={
          <Link href="/suppliers/new" className={buttonClass}>
            New supplier
          </Link>
        }
      />

      <form className="mb-4 flex flex-wrap items-center gap-2">
        <input name="q" defaultValue={q} placeholder="Search name or contact…" className={`${inputClass} max-w-xs`} />
        <select name="asl" defaultValue={asl} className={`${inputClass} w-auto`}>
          <option value="">Any ASL status</option>
          <option value="yes">ASL approved</option>
          <option value="no">Not approved</option>
        </select>
        <label className="flex items-center gap-1 text-sm text-slate-600">
          <input type="checkbox" name="inactive" defaultChecked={!!inactive} /> Show inactive
        </label>
        <button className={secondaryButtonClass}>Filter</button>
      </form>

      <Table
        head={["Name", "Type", "ASL", "Complete", "Contact", "Receipts"]}
        empty={suppliers.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-500">No suppliers match.</p>}
      >
        {suppliers.map((s) => (
          <tr key={s.id} className="hover:bg-slate-50">
            <td className="px-4 py-2">
              <Link href={`/suppliers/${s.id}`} className="font-medium text-sky-700 hover:underline">
                {s.name}
              </Link>{" "}
              {!s.active && <Badge>inactive</Badge>}
            </td>
            <td className="px-4 py-2 text-slate-600">{supplierTypeLabel(s.type)}</td>
            <td className="px-4 py-2">
              {s.aslApproved ? <Badge tone="green">approved</Badge> : <Badge tone="red">not approved</Badge>}
            </td>
            <td className="px-4 py-2">
              <CompletionBar summary={supplierChecklist(s)} compact />
            </td>
            <td className="px-4 py-2 text-slate-600">{[s.contactName, s.email, s.phone].filter(Boolean).join(" · ") || "—"}</td>
            <td className="px-4 py-2 tabular-nums">{s._count.receipts}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
