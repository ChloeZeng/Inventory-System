import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import Link from "next/link";
import { SUPPLIER_DOCUMENT_TYPES, supplierTypeLabel } from "@/lib/constants";
import { supplierChecklist } from "@/lib/records";
import { Badge, Card, PageHeader, Table, formatDate, formatDateTime } from "@/components/ui";
import { Checklist, CompletionBar } from "@/components/progress";
import { UploadForm } from "@/components/upload-form";
import { AuditHistory } from "@/components/audit-history";
import { SupplierForm } from "../supplier-form";
import { updateSupplier, uploadSupplierDocument } from "../actions";

export default async function SupplierDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ doc?: string }>;
}) {
  const id = Number((await params).id);
  const { doc } = await searchParams;
  if (!Number.isInteger(id)) notFound();
  const supplier = await prisma.supplier.findUnique({
    where: { id },
    include: {
      receipts: { include: { lots: { select: { id: true } } }, orderBy: { dateReceived: "desc" }, take: 20 },
      documents: { include: { uploadedBy: true }, orderBy: { uploadedAt: "desc" } },
    },
  });
  if (!supplier) notFound();
  const user = await getCurrentUser();
  const checklist = supplierChecklist(supplier);

  return (
    <>
      <PageHeader
        back={{ href: "/suppliers", label: "Suppliers" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {supplier.name}
            {supplier.aslApproved ? <Badge tone="green">ASL approved</Badge> : <Badge tone="red">not ASL approved</Badge>}
            {!supplier.active && <Badge>inactive</Badge>}
            {checklist.complete && <Badge tone="green">Audit ready</Badge>}
          </span>
        }
        subtitle={supplierTypeLabel(supplier.type)}
      />

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Card title="Supplier checklist" className="lg:col-span-2">
          <div className="mb-4">
            <CompletionBar summary={checklist} />
          </div>
          <Checklist summary={checklist} ctx={{ supplierId: supplier.id }} canFix={!!user} />
        </Card>

        <Card title="Documents" id="documents">
          {supplier.documents.length > 0 ? (
            <ul className="mb-4 divide-y divide-slate-100 text-sm">
              {supplier.documents.map((d) => (
                <li key={d.id} className="py-2">
                  <Badge tone="blue">{d.type}</Badge>{" "}
                  <a href={`/api/files/${d.id}`} target="_blank" className="text-sky-700 hover:underline">
                    {d.fileName}
                  </a>
                  <div className="text-xs text-slate-500">
                    {d.uploadedBy.name} · {formatDateTime(d.uploadedAt)}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-4 text-sm text-slate-500">No documents yet.</p>
          )}
          {user ? (
            <UploadForm
              key={doc ?? "none"}
              action={uploadSupplierDocument.bind(null, supplier.id)}
              types={SUPPLIER_DOCUMENT_TYPES}
              defaultType={doc && (SUPPLIER_DOCUMENT_TYPES as readonly string[]).includes(doc) ? doc : "Supplier questionnaire"}
            />
          ) : (
            <p className="text-sm text-amber-700">Pick a user in the top bar to upload.</p>
          )}
        </Card>
      </div>

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
                  <td className="px-4 py-2 font-mono">
                    {r.lots[0] ? (
                      <Link href={`/lots/${r.lots[0].id}`} className="text-sky-700 hover:underline">
                        {r.receivingNo}
                      </Link>
                    ) : (
                      r.receivingNo
                    )}
                  </td>
                  <td className="px-4 py-2">{formatDate(r.dateReceived)}</td>
                  <td className="px-4 py-2">{r.lots.length}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-base font-semibold">Audit history</h2>
      <AuditHistory
        scopes={[
          { table: "Supplier", ids: [supplier.id] },
          { table: "Document", ids: supplier.documents.map((d) => d.id) },
        ]}
      />
    </>
  );
}
