import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { categoryLabel, formatQty, parseCategoryConfig, parseSpecs, subTypeLabel } from "@/lib/category-config";
import { testPathLabel } from "@/lib/constants";
import { getCurrentUser } from "@/lib/current-user";
import Link from "next/link";
import { ITEM_DOCUMENT_TYPES } from "@/lib/constants";
import { itemChecklist, lotLabel } from "@/lib/records";
import { Badge, Card, PageHeader, Table, formatDate, formatDateTime } from "@/components/ui";
import { Checklist, CompletionBar } from "@/components/progress";
import { QcStatusBadge } from "@/components/qc-status-badge";
import { UploadForm } from "@/components/upload-form";
import { AuditHistory } from "@/components/audit-history";
import { ItemForm } from "../item-form";
import { updateItem, uploadItemDocument } from "../actions";

export default async function ItemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ doc?: string }>;
}) {
  const id = Number((await params).id);
  const { doc } = await searchParams;
  if (!Number.isInteger(id)) notFound();
  const item = await prisma.item.findUnique({
    where: { id },
    include: {
      category: true,
      supplier: { select: { id: true, name: true } },
      documents: { include: { uploadedBy: true }, orderBy: { uploadedAt: "desc" } },
      lots: { include: { receipt: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!item) notFound();

  const [user, suppliers] = await Promise.all([
    getCurrentUser(),
    prisma.supplier.findMany({ where: { OR: [{ active: true }, { id: item.supplierId ?? -1 }] }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const config = parseCategoryConfig(item.category.config);
  const specs = parseSpecs(item.specs);
  const hasSpecSheet = item.documents.some((d) => d.type === "Spec sheet");
  const checklist = itemChecklist(item);

  return (
    <>
      <PageHeader
        back={{ href: "/items", label: "Items" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono">{item.code}</span>
            <span className="text-slate-500">{item.name}</span>
            {!item.active && <Badge>inactive</Badge>}
            {checklist.complete && <Badge tone="green">Audit ready</Badge>}
          </span>
        }
        subtitle={
          <>
            {categoryLabel(item.category)}
            {item.subType && <> · {subTypeLabel(config, item.subType)}</>}
            {item.legacyCode && (
              <>
                {" "}
                · old code <span className="font-mono">{item.legacyCode}</span>
              </>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Item checklist">
            <div className="mb-4">
              <CompletionBar summary={checklist} />
            </div>
            <Checklist summary={checklist} ctx={{ itemId: item.id }} canFix={!!user} />
          </Card>

          <Card title="Item details">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-slate-500">Owner</dt>
                <dd className="font-medium">{item.owner}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Dedicated product</dt>
                <dd className="font-medium">{item.dedicatedProduct ?? <span className="font-normal text-slate-500">none</span>}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Usual supplier</dt>
                <dd className="font-medium">
                  {item.supplier ? (
                    <Link href={`/suppliers/${item.supplier.id}`} className="text-sky-700 hover:underline">
                      {item.supplier.name}
                    </Link>
                  ) : (
                    <span className="font-normal text-slate-500">not set</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Counted in</dt>
                <dd className="font-medium">{item.category.unit}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-slate-500">Testing before release</dt>
                <dd className="font-medium">{testPathLabel(item.category.testPath) ?? "—"}</dd>
              </div>
            </dl>
            <h3 className="mb-2 mt-5 text-sm font-semibold text-slate-800">Description</h3>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              {config.specFields.map((f) => (
                <div key={f.key}>
                  <dt className="text-slate-500">{f.label}</dt>
                  <dd className="font-medium">{specs[f.key] || <span className="text-amber-700">not set</span>}</dd>
                </div>
              ))}
              <div>
                <dt className="text-slate-500">Spec sheet</dt>
                <dd>{hasSpecSheet ? <Badge tone="green">on file</Badge> : <Badge tone="amber">missing — needed before release</Badge>}</dd>
              </div>
            </dl>
          </Card>

          <Card title="Documents" id="documents">
            {item.documents.length > 0 && (
              <ul className="mb-4 divide-y divide-slate-100 text-sm">
                {item.documents.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <Badge tone="blue">{d.type}</Badge>{" "}
                      <a href={`/api/files/${d.id}`} target="_blank" className="text-sky-700 hover:underline">
                        {d.fileName}
                      </a>
                    </span>
                    <span className="text-slate-500">
                      {d.uploadedBy.name} · {formatDateTime(d.uploadedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {user ? (
              <UploadForm
                key={doc ?? "none"}
                action={uploadItemDocument.bind(null, item.id)}
                types={ITEM_DOCUMENT_TYPES}
                defaultType={doc && (ITEM_DOCUMENT_TYPES as readonly string[]).includes(doc) ? doc : "Spec sheet"}
              />
            ) : (
              <p className="text-sm text-amber-700">Pick a user in the top bar to upload.</p>
            )}
          </Card>

          <Card title={`Lots (${item.lots.length})`}>
            {item.lots.length === 0 ? (
              <p className="text-sm text-slate-500">No lots received yet.</p>
            ) : (
              <Table head={["Batch / lot", "Receiving no.", "Received", "Qty received", "Status"]}>
                {item.lots.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-2">
                      <Link href={`/lots/${l.id}`} className="font-mono text-sky-700 hover:underline">
                        {lotLabel(l)}
                      </Link>
                    </td>
                    <td className="px-4 py-2 font-mono">{l.receipt.receivingNo}</td>
                    <td className="px-4 py-2">{formatDate(l.receipt.dateReceived)}</td>
                    <td className="px-4 py-2 tabular-nums">{formatQty(l.qtyReceived, item.category.unit)}</td>
                    <td className="px-4 py-2">
                      <QcStatusBadge status={l.qcStatus} />
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>

        <Card title="Edit item" className="self-start">
          <p className="mb-4 text-xs text-slate-500">
            The code <span className="font-mono">{item.code}</span> and category{item.subType ? " (and type)" : ""} are permanent.
          </p>
          {user ? (
            <ItemForm
              action={updateItem.bind(null, item.id)}
              specFields={config.specFields}
              suppliers={suppliers}
              initial={{
                name: item.name,
                legacyCode: item.legacyCode,
                specs,
                active: item.active,
                owner: item.owner,
                dedicatedProduct: item.dedicatedProduct,
                supplierId: item.supplierId,
              }}
            />
          ) : (
            <p className="text-sm text-amber-700">Pick a user in the top bar to edit.</p>
          )}
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-base font-semibold">Audit history</h2>
      <AuditHistory
        scopes={[
          { table: "Item", ids: [item.id] },
          { table: "Document", ids: item.documents.map((d) => d.id) },
        ]}
      />
    </>
  );
}
