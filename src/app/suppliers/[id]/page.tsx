import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { supplierTypeLabel } from "@/lib/constants";
import { Badge, Card, PageHeader, Table } from "@/components/ui";
import { AuditHistory } from "@/components/audit-history";
import { SupplierForm } from "../supplier-form";
import { updateSupplier } from "../actions";

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const supplier = await prisma.supplier.findUnique({
    where: { id },
    include: { receipts: { include: { _count: { select: { lots: true } } }, orderBy: { dateReceived: "desc" }, take: 20 } },
  });
  if (!supplier) notFound();
  const user = await getCurrentUser();

  return (
    <>
      <PageHeader
        back={{ href: "/suppliers", label: "Suppliers" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {supplier.name}
            {supplier.aslApproved ? <Badge tone="green">ASL approved</Badge> : <Badge tone="red">not ASL approved</Badge>}
            {!supplier.active && <Badge>inactive</Badge>}
          </span>
        }
        subtitle={supplierTypeLabel(supplier.type)}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Details" className="lg:col-span-2">
          {user ? (
            <SupplierForm
              action={updateSupplier.bind(null, supplier.id)}
              canApprove={user.role === "qc" || user.role === "admin"}
              initial={supplier}
            />
          ) : (
            <p className="text-sm text-amber-700">Pick a user in the top bar to edit.</p>
          )}
        </Card>

        <Card title="Recent receipts" className="self-start">
          {supplier.receipts.length === 0 ? (
            <p className="text-sm text-slate-500">No receipts yet.</p>
          ) : (
            <Table head={["Receiving no.", "Date", "Lots"]}>
              {supplier.receipts.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 font-mono">{r.receivingNo}</td>
                  <td className="px-4 py-2">{r.dateReceived.toLocaleDateString()}</td>
                  <td className="px-4 py-2">{r._count.lots}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-base font-semibold">Audit history</h2>
      <AuditHistory table="Supplier" recordId={supplier.id} />
    </>
  );
}
