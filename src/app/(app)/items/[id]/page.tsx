import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { categoryLabel, formatQty, itemSettings, parseSpecs, subTypeLabel, unitSingular } from "@/lib/category-config";
import { getCurrentUser } from "@/lib/current-user";
import { ITEM_DOCUMENT_TYPES, USAGE_TYPES, testPathLabel, transactionTypeLabel } from "@/lib/constants";
import { itemChecklist, lotLabel } from "@/lib/records";
import { itemStock } from "@/lib/stock";
import { getPreference } from "@/lib/preferences";
import { Badge, Card, Table, buttonClass, formatDate, formatDateTime, formatMoney } from "@/components/ui";
import { QcStatusBadge } from "@/components/qc-status-badge";
import { UploadForm } from "@/components/upload-form";
import { AuditHistory } from "@/components/audit-history";
import { DocumentGallery } from "@/components/document-gallery";
import { PickableTable, type PickableColumn } from "@/components/pickable-table";
import { DetailHeader, DetailShell, DetailTabs, FlashMessage, type ShellModal } from "@/components/detail/shell";
import { OpenActionButton, OpenActionLink, TabLink } from "@/components/detail/open-action";
import { ItemForm } from "../item-form";
import { updateItem, uploadItemDocument } from "../actions";

// Item detail: who/what it is and how much is on hand at the top; "Edit" opens the form in a
// modal; tabs for its lots, usage, documents, details and audit history.

const LOT_COLUMNS: PickableColumn[] = [
  { key: "remaining", label: "Remaining", numeric: true },
  { key: "status", label: "Status" },
  { key: "expiry", label: "Expiry" },
  { key: "mfg", label: "Mfg date" },
  { key: "received", label: "Received" },
  { key: "receivedQty", label: "Qty received", numeric: true },
  { key: "location", label: "Location" },
  { key: "supplier", label: "Supplier" },
  { key: "receivingNo", label: "Receiving no." },
  { key: "unitCost", label: "Unit cost", numeric: true },
];
const LOT_DEFAULTS = ["remaining", "status"];
const LOTS_PREF = "item:lots";

export default async function ItemDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ doc?: string }> }) {
  const id = Number((await params).id);
  const { doc } = await searchParams;
  if (!Number.isInteger(id)) notFound();
  const item = await prisma.item.findUnique({
    where: { id },
    include: {
      category: true,
      supplier: { select: { id: true, name: true } },
      documents: { include: { uploadedBy: true }, orderBy: { uploadedAt: "desc" } },
      lots: {
        include: { receipt: { include: { supplier: { select: { name: true } } } }, location: true },
        orderBy: [{ receipt: { dateReceived: "desc" } }, { id: "desc" }],
      },
    },
  });
  if (!item) notFound();

  const user = await getCurrentUser();
  const [suppliers, usage, savedLotColumns] = await Promise.all([
    prisma.supplier.findMany({ where: { OR: [{ active: true }, { id: item.supplierId ?? -1 }] }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.inventoryTransaction.findMany({
      where: { lot: { itemId: item.id }, type: { not: "receive" } },
      include: { lot: true, operator: true, room: true },
      orderBy: [{ date: "desc" }, { id: "desc" }],
    }),
    user ? getPreference<string[]>(user.id, LOTS_PREF) : null,
  ]);

  const settings = itemSettings(item.category, item.subType);
  const config = settings.config;
  const unit = settings.unit;
  const specs = parseSpecs(item.specs);
  const checklist = itemChecklist(item);
  const stock = itemStock(item.lots.map((l) => ({ qcStatus: l.qcStatus, balance: l.wfBalance, expDate: l.expDate, location: l.location.name })));
  const lastCost = item.lots.find((l) => l.unitCost !== null)?.unitCost ?? null;
  const lastReceived = item.lots[0]?.receipt.dateReceived ?? null;
  const lastUsed = usage.find((t) => (USAGE_TYPES as readonly string[]).includes(t.type))?.date ?? null;
  const ownerLine = item.dedicatedProduct ? `${item.owner} / ${item.dedicatedProduct}` : item.owner;

  const modals: Record<string, ShellModal> = {};
  if (user)
    modals["do:edit"] = {
      title: `Edit ${item.code}`,
      size: "xl",
      doneMessage: "Saved.",
      body: (
        <>
          <p className="mb-4 text-xs text-slate-500">
            The code <span className="font-mono">{item.code}</span> and category{item.subType ? " (and type)" : ""} are permanent.
          </p>
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
        </>
      ),
    };

  // ---- tabs -----------------------------------------------------------------------------------
  const lotsTab = (
    <PickableTable
      firstLabel="Lot no."
      options={LOT_COLUMNS}
      defaults={LOT_DEFAULTS}
      initial={LOT_COLUMNS.filter((c) => (savedLotColumns?.length ? savedLotColumns : LOT_DEFAULTS).includes(c.key)).map((c) => c.key)}
      prefKey={LOTS_PREF}
      empty="No lots received yet."
      rows={item.lots.map((l) => ({
        id: l.id,
        href: `/lots/${l.id}`,
        label: lotLabel(l),
        cells: {
          remaining: formatQty(l.wfBalance, unit),
          status: <QcStatusBadge status={l.qcStatus} />,
          expiry: formatDate(l.expDate),
          mfg: formatDate(l.mfgDate),
          received: formatDate(l.receipt.dateReceived),
          receivedQty: formatQty(l.qtyReceived, unit),
          location: l.location.name,
          supplier: l.receipt.supplier.name,
          receivingNo: <span className="font-mono">{l.receipt.receivingNo}</span>,
          unitCost: l.unitCost !== null ? formatMoney(Number(l.unitCost)) : "—",
        },
      }))}
    />
  );

  const usageTab = (
    <Table
      head={["Date", "Lot", "Type", "Qty", "Product / customer", "Room", "By", "Reason / notes"]}
      empty={usage.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-500">Nothing used from this item yet.</p>}
    >
      {usage.map((t) => (
        <tr key={t.id}>
          <td className="whitespace-nowrap px-4 py-2">{formatDate(t.date)}</td>
          <td className="px-4 py-2 font-mono">
            <Link href={`/lots/${t.lotId}`} className="text-sky-700 hover:underline">
              {lotLabel(t.lot)}
            </Link>
          </td>
          <td className="px-4 py-2">{transactionTypeLabel(t.type)}</td>
          <td className={`whitespace-nowrap px-4 py-2 tabular-nums ${t.qty < 0 ? "text-red-700" : "text-emerald-700"}`}>
            {t.qty > 0 ? "+" : t.qty < 0 ? "−" : ""}
            {formatQty(Math.abs(t.qty), unit)}
          </td>
          <td className="px-4 py-2">{t.productOrCustomer ?? "—"}</td>
          <td className="px-4 py-2">{t.room?.name ?? "—"}</td>
          <td className="px-4 py-2">{t.operator.name}</td>
          <td className="px-4 py-2 text-slate-600">{[t.reason, t.notes].filter(Boolean).join(" · ") || "—"}</td>
        </tr>
      ))}
    </Table>
  );

  const documentsTab = (
    <div className="space-y-6">
      <DocumentGallery
        docs={item.documents.map((d) => ({
          id: d.id,
          type: d.type,
          fileName: d.fileName,
          mimeType: d.mimeType,
          scope: `Item ${item.code}`,
          uploadedBy: d.uploadedBy.name,
          uploadedAt: formatDateTime(d.uploadedAt),
        }))}
      />
      {user && (
        <Card title="Upload a document">
          <UploadForm
            key={doc ?? "none"}
            action={uploadItemDocument.bind(null, item.id)}
            types={ITEM_DOCUMENT_TYPES}
            defaultType={doc && (ITEM_DOCUMENT_TYPES as readonly string[]).includes(doc) ? doc : "Spec sheet"}
          />
        </Card>
      )}
    </div>
  );

  const detailsTab = (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Description">
        <dl className="space-y-2 text-sm">
          {config.specFields.map((f) => (
            <Row key={f.key} label={f.label}>
              {specs[f.key] || <span className="text-amber-700">not set</span>}
            </Row>
          ))}
          <Row label="Category">{categoryLabel(item.category)}</Row>
          {item.subType && <Row label="Type">{subTypeLabel(config, item.subType)}</Row>}
          <Row label="Counted in">{unit}</Row>
          <Row label="Testing before release">{testPathLabel(settings.testPath) ?? "—"}</Row>
          {item.legacyCode && (
            <Row label="Code in old spreadsheet">
              <span className="font-mono">{item.legacyCode}</span>
            </Row>
          )}
        </dl>
      </Card>
      <Card title="Supply and use">
        <dl className="space-y-2 text-sm">
          <Row label="Owner">{item.owner}</Row>
          <Row label="Dedicated product">{item.dedicatedProduct ?? "none"}</Row>
          <Row label="Usual supplier">
            {item.supplier ? (
              <Link href={`/suppliers/${item.supplier.id}`} className="text-sky-700 hover:underline">
                {item.supplier.name}
              </Link>
            ) : (
              "not set"
            )}
          </Row>
          <Row label="Unit cost (last received)">{lastCost !== null ? `${formatMoney(Number(lastCost))} per ${unitSingular(unit)}` : "—"}</Row>
          <Row label="Last received">{formatDate(lastReceived)}</Row>
          <Row label="Last used">{formatDate(lastUsed)}</Row>
          <Row label="Nearest expiry (available)">{formatDate(stock.nearestExpiry)}</Row>
          <Row label="Active">{item.active ? "Yes — shown when receiving" : "No"}</Row>
        </dl>
      </Card>
    </div>
  );

  const auditTab = (
    <AuditHistory
      scopes={[
        { table: "Item", ids: [item.id] },
        { table: "Document", ids: item.documents.map((d) => d.id) },
      ]}
    />
  );

  return (
    <DetailShell defaultTab={doc ? "documents" : "lots"} modals={modals}>
      <DetailHeader
        back={
          <Link href="/inventory" className="text-sky-700 hover:underline">
            ← Inventory
          </Link>
        }
        title={
          <span className="flex flex-wrap items-baseline gap-x-3">
            <span className="font-mono">{item.code}</span>
            <span className="text-slate-600">{item.name}</span>
          </span>
        }
        badges={
          <>
            {checklist.complete && <Badge tone="green">Record complete</Badge>}
            {!item.active && <Badge>inactive</Badge>}
          </>
        }
        meta={
          <>
            {ownerLine} · {categoryLabel(item.category)}
            {item.subType && ` · ${subTypeLabel(config, item.subType)}`}
          </>
        }
        aside={
          <div className="flex flex-wrap items-start gap-x-6 gap-y-2 text-sm">
            <div>
              <div className="text-xs text-slate-500">Available</div>
              <div className="font-semibold tabular-nums">{formatQty(stock.available, unit)}</div>
              <div className="mt-1 flex flex-wrap gap-1 text-xs">
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800">Released {formatQty(stock.available, unit)}</span>
                <span className={`rounded-full px-2 py-0.5 ${stock.quarantine ? "bg-amber-50 text-amber-900" : "bg-slate-100 text-slate-500"}`}>
                  Quarantine {formatQty(stock.quarantine, unit)}
                </span>
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">{stock.locations.length === 1 ? "Location" : "Locations"}</div>
              <div className="font-medium">{stock.locations.join(", ") || "—"}</div>
            </div>
            {user && (
              <OpenActionButton name="edit" className={`${buttonClass} px-3 py-1.5`}>
                Edit
              </OpenActionButton>
            )}
          </div>
        }
      />

      <div className="mt-4 space-y-4">
        <FlashMessage />
        {!checklist.complete && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-medium">Record incomplete — missing:</p>
            <ul className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
              {checklist.open.map((r) => (
                <li key={r.req.key} className="flex items-center gap-2">
                  {r.req.label}
                  {user &&
                    (r.req.source === "document" ? (
                      <TabLink tab="documents">Upload</TabLink>
                    ) : (
                      <OpenActionLink name="edit">Edit</OpenActionLink>
                    ))}
                </li>
              ))}
            </ul>
          </div>
        )}

        <DetailTabs
          tabs={[
            { key: "lots", label: "Lots", count: item.lots.length, content: lotsTab },
            { key: "usage", label: "Usage", count: usage.length, content: usageTab },
            { key: "documents", label: "Documents", count: item.documents.length, content: documentsTab },
            { key: "details", label: "Details", content: detailsTab },
            { key: "history", label: "Audit history", content: auditTab },
          ]}
        />
      </div>
    </DetailShell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}
