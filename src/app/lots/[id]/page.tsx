import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { parseCategoryConfig, parseSpecs, formatSpecs } from "@/lib/category-config";
import { LOT_DOCUMENT_TYPES, segregationLabel, supplierTypeLabel, transactionTypeLabel } from "@/lib/constants";
import { toDateInput } from "@/lib/forms";
import { LOT_INCLUDE, fixHref, lotLabel, lotStatus } from "@/lib/records";
import { loadAnsiTables, samplingPlan } from "@/lib/sampling";
import {
  Badge,
  Card,
  PageHeader,
  Table,
  buttonClass,
  formatDate,
  formatDateTime,
  formatMoney,
  secondaryButtonClass,
} from "@/components/ui";
import { Checklist, CompletionBar, Stepper } from "@/components/progress";
import { UploadForm } from "@/components/upload-form";
import { AuditHistory } from "@/components/audit-history";
import { QcStatusBadge } from "@/components/qc-status-badge";
import { LotDetailsForm } from "../lot-details-form";
import { updateLotDetails, uploadLotDocument } from "../actions";

export default async function LotDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ received?: string; doc?: string }>;
}) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const { received, doc } = await searchParams;

  const lot = await prisma.lot.findUnique({ where: { id }, include: LOT_INCLUDE });
  if (!lot) notFound();

  const [user, details, locations, tables] = await Promise.all([
    getCurrentUser(),
    prisma.lot.findUniqueOrThrow({
      where: { id },
      include: {
        operator: true,
        releasedBy: true,
        receipt: { include: { receivedBy: true, documents: { include: { uploadedBy: true } }, lots: { include: { item: true } } } },
        documents: { include: { uploadedBy: true }, orderBy: { uploadedAt: "desc" } },
        item: { include: { documents: { where: { type: "Spec sheet" }, include: { uploadedBy: true } } } },
        inspections: { include: { inspectedBy: true }, orderBy: { inspectedAt: "desc" } },
        transactions: { include: { operator: true, room: true }, orderBy: [{ date: "asc" }, { id: "asc" }] },
      },
    }),
    prisma.location.findMany({ orderBy: { name: "asc" } }),
    loadAnsiTables(prisma),
  ]);

  const { summary, balance, progress, lastInspection } = lotStatus(lot);
  const config = parseCategoryConfig(lot.item.category.config);
  const label = lotLabel(lot);
  const ctx = { lotId: lot.id, itemId: lot.itemId, supplierId: lot.receipt.supplierId };
  const unitCost = lot.unitCost ? Number(lot.unitCost) : null;
  const firstMissing = summary.missing.find((r) => r.req.source !== "inspection");
  let plan: ReturnType<typeof samplingPlan> | null = null;
  let planError: string | null = null;
  try {
    if (lot.item.category.testPath === "ansi_sampling") plan = samplingPlan(tables, lot.qtyReceived);
  } catch (e) {
    planError = e instanceof Error ? e.message : String(e);
  }

  const captions = [
    formatDate(lot.receipt.dateReceived),
    lot.qcStatus === "Quarantine" ? "On hold" : "Ended",
    lastInspection ? lastInspection.disposition : plan ? `${plan.sampleSize.toLocaleString()} samples` : undefined,
    lot.qcStatus === "Released" ? formatDate(lot.releasedAt) : lot.qcStatus === "Rejected" ? "Rejected" : undefined,
    lot.qcStatus === "Released" ? `${balance.toLocaleString()} left` : undefined,
  ];

  const documents = [
    ...details.documents.map((d) => ({ ...d, scope: "This lot" })),
    ...details.receipt.documents.map((d) => ({ ...d, scope: `Whole delivery ${lot.receipt.receivingNo}` })),
    ...details.item.documents.map((d) => ({ ...d, scope: `Item ${lot.item.code}` })),
  ];
  const otherLots = details.receipt.lots.filter((l) => l.id !== lot.id);

  return (
    <>
      {received && (
        <div className="mb-6 rounded-lg border border-emerald-300 bg-emerald-50 px-5 py-4">
          <p className="font-medium text-emerald-900">
            Received on <span className="font-mono">{lot.receipt.receivingNo}</span>. The lot is in Quarantine — keep the quarantine
            stickers on.
          </p>
          <p className="mt-1 text-sm text-emerald-900">
            Next: {progress.nextLabel}
            {summary.missing.length > 0 && ` · ${summary.missing.length} requirement${summary.missing.length > 1 ? "s" : ""} still open (see the checklist below).`}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/receive?receipt=${lot.receiptId}`} className={buttonClass}>
              Add another lot to {lot.receipt.receivingNo}
            </Link>
            <Link href="/receive" className={secondaryButtonClass}>
              Receive a new delivery
            </Link>
            <Link href="/" className={secondaryButtonClass}>
              Back to my to-do list
            </Link>
          </div>
        </div>
      )}

      <PageHeader
        back={{ href: "/lots", label: "Lots" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span>
              Lot <span className="font-mono">{label}</span>
            </span>
            <QcStatusBadge status={lot.qcStatus} />
            {summary.complete && <Badge tone="green">Audit ready</Badge>}
          </span>
        }
        subtitle={
          <>
            <Link href={`/items/${lot.itemId}`} className="text-sky-700 hover:underline">
              <span className="font-mono">{lot.item.code}</span> {lot.item.name}
            </Link>{" "}
            · <span className="font-mono">{lot.receipt.receivingNo}</span> ·{" "}
            <Link href={`/suppliers/${lot.receipt.supplierId}`} className="text-sky-700 hover:underline">
              {lot.receipt.supplier.name}
            </Link>
          </>
        }
      />

      <Card className="mb-6">
        <Stepper states={progress.states} captions={captions} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Requirements" className="lg:col-span-2">
          <div className="mb-5">
            <CompletionBar summary={summary} />
          </div>
          <Checklist summary={summary} ctx={ctx} canFix={!!user} />
        </Card>

        <div className="space-y-6">
          <Card title="What’s next">
            <p className="text-lg font-medium">{progress.nextLabel}</p>
            <NextStep
              next={progress.next}
              role={user?.role}
              fixLink={firstMissing ? fixHref(firstMissing.req, ctx) : null}
              fixLabel={firstMissing?.req.label}
              sampleSize={plan?.sampleSize}
            />
          </Card>

          <Card title="Balance and cost">
            <dl className="space-y-2 text-sm">
              <Row label="Received">{lot.qtyReceived.toLocaleString()} units</Row>
              <Row label="Balance on hand">
                <span className="text-lg font-semibold tabular-nums">{balance.toLocaleString()}</span> units
              </Row>
              <Row label="Unit cost">{unitCost !== null ? formatMoney(unitCost) : <span className="text-amber-700">not entered</span>}</Row>
              <Row label="Lot value received">{unitCost !== null ? formatMoney(unitCost * lot.qtyReceived, 2) : "—"}</Row>
              <Row label="Value on hand">{unitCost !== null ? formatMoney(unitCost * balance, 2) : "—"}</Row>
            </dl>
            <p className="mt-3 text-xs text-slate-500">Balance is calculated from the transactions below, never typed.</p>
          </Card>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Lot information" className="lg:col-span-1">
          <dl className="space-y-2 text-sm">
            <Row label="Category">{lot.item.category.name}</Row>
            <Row label="Specs">{formatSpecs(config, parseSpecs(lot.item.specs)) || "—"}</Row>
            <Row label="Supplier batch no.">{lot.supplierBatchNo ?? "—"}</Row>
            <Row label="Lot no.">{lot.lotNo ?? "—"}</Row>
            <Row label="Mfg / exp">
              {formatDate(lot.mfgDate)} / {formatDate(lot.expDate)}
            </Row>
            <Row label="Quantity">
              {lot.cases.toLocaleString()} cases × {lot.unitsPerCase.toLocaleString()} = {lot.qtyReceived.toLocaleString()}
              {lot.qtyOverrideReason && <div className="text-xs text-slate-500">Counted: {lot.qtyOverrideReason}</div>}
            </Row>
            <Row label="Location">{lot.location.name}</Row>
            <Row label="Supplier type">{supplierTypeLabel(lot.receipt.supplierType)}</Row>
            <Row label="Segregation">{segregationLabel(lot.receipt.segregation)}</Row>
            <Row label="Date received">{formatDate(lot.receipt.dateReceived)}</Row>
            <Row label="Received by">{details.receipt.receivedBy.name}</Row>
            <Row label="Truck inspected">{lot.receipt.carrierInspectionDone ? "Yes (F.WD.001)" : "No"}</Row>
            <Row label="Matches packing list">
              {lot.receipt.qtyMatchesPackingList === null ? "—" : lot.receipt.qtyMatchesPackingList ? "Yes" : `No — ${lot.receipt.qtyMatchNote ?? ""}`}
            </Row>
          </dl>
          {otherLots.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3 text-sm">
              <div className="mb-1 text-slate-500">Other lots on {lot.receipt.receivingNo}</div>
              <ul className="space-y-1">
                {otherLots.map((l) => (
                  <li key={l.id}>
                    <Link href={`/lots/${l.id}`} className="text-sky-700 hover:underline">
                      {lotLabel(l)}
                    </Link>{" "}
                    <span className="text-slate-500">
                      {l.item.code} · {l.qcStatus}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card title="Complete or correct details" className="lg:col-span-2" id="details">
          {user ? (
            <LotDetailsForm
              action={updateLotDetails.bind(null, lot.id)}
              locations={locations}
              initial={{
                receivingNo: lot.receipt.receivingNo,
                lotsOnReceipt: details.receipt.lots.length,
                poInvoiceNo: lot.receipt.poInvoiceNo ?? "",
                trackingNo: lot.receipt.trackingNo ?? "",
                carrierInspectionDone: lot.receipt.carrierInspectionDone,
                qtyMatchesPackingList: lot.receipt.qtyMatchesPackingList,
                qtyMatchNote: lot.receipt.qtyMatchNote ?? "",
                segregation: lot.receipt.segregation,
                quarantineStickerApplied: lot.receipt.quarantineStickerApplied,
                supplierBatchNo: lot.supplierBatchNo ?? "",
                lotNo: lot.lotNo ?? "",
                mfgDate: toDateInput(lot.mfgDate),
                expDate: toDateInput(lot.expDate),
                unitCost: lot.unitCost?.toString() ?? "",
                locationId: lot.locationId,
              }}
            />
          ) : (
            <p className="text-sm text-amber-700">Pick a user in the top bar to make changes.</p>
          )}
        </Card>
      </div>

      <Card title="Documents" className="mt-6" id="documents">
        {documents.length > 0 ? (
          <ul className="mb-4 divide-y divide-slate-100 text-sm">
            {documents.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <Badge tone="blue">{d.type}</Badge>{" "}
                  <a href={`/api/files/${d.id}`} target="_blank" className="text-sky-700 hover:underline">
                    {d.fileName}
                  </a>{" "}
                  <span className="text-xs text-slate-500">· {d.scope}</span>
                </span>
                <span className="text-slate-500">
                  {d.uploadedBy.name} · {formatDateTime(d.uploadedAt)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-slate-500">No documents yet.</p>
        )}
        {user ? (
          <>
            <UploadForm
              key={doc ?? "none"}
              action={uploadLotDocument.bind(null, lot.id)}
              types={LOT_DOCUMENT_TYPES}
              defaultType={doc && (LOT_DOCUMENT_TYPES as readonly string[]).includes(doc) ? doc : "COA"}
            />
            <p className="mt-2 text-xs text-slate-500">
              Invoices and F.WD.001 are filed on the whole delivery {lot.receipt.receivingNo}. The spec sheet belongs to the item —{" "}
              <Link href={`/items/${lot.itemId}?doc=Spec%20sheet#documents`} className="text-sky-700 hover:underline">
                upload it on {lot.item.code}
              </Link>
              .
            </p>
          </>
        ) : (
          <p className="text-sm text-amber-700">Pick a user in the top bar to upload.</p>
        )}
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Inspection (F.WD.003)" id="inspection">
          {plan && (
            <>
              <p className="mb-3 text-sm text-slate-600">
                Lot size {plan.lotSize.toLocaleString()} units · General Level {plan.inspectionLevel} · code letter{" "}
                <strong>{plan.codeLetter}</strong> · draw <strong>{plan.sampleSize.toLocaleString()}</strong>
                {plan.hundredPercent ? " (100% inspection)" : " samples"}
              </p>
              <Table head={["Defect class", "AQL", "Plan", "Sample", "Accept (Ac)", "Reject (Re)"]}>
                {plan.classes.map((c) => (
                  <tr key={c.cls}>
                    <td className="px-4 py-2">{c.label}</td>
                    <td className="px-4 py-2 tabular-nums">{c.aql}</td>
                    <td className="px-4 py-2">
                      {c.codeLetter}
                      {c.codeLetter !== plan.codeLetter && <span className="text-xs text-slate-500"> (arrow)</span>}
                    </td>
                    <td className="px-4 py-2 tabular-nums">{c.sampleSize.toLocaleString()}</td>
                    <td className="px-4 py-2 tabular-nums">{c.ac}</td>
                    <td className="px-4 py-2 tabular-nums">{c.re}</td>
                  </tr>
                ))}
              </Table>
              {plan.classes.some((c) => c.sampleSize < plan!.sampleSize) && (
                <p className="mt-2 text-xs text-slate-500">
                  Draw the largest sample; count defects for smaller-sample classes in the first{" "}
                  {Math.min(...plan.classes.map((c) => c.sampleSize)).toLocaleString()} units (to confirm with QA).
                </p>
              )}
              <p className="mt-2 text-xs text-slate-500">ANSI Z1.4 tables are seed data — QA must verify them against the printed standard.</p>
            </>
          )}
          {planError && <p className="text-sm text-red-700">Sampling plan unavailable: {planError}</p>}
          {!plan && !planError && <p className="text-sm text-slate-500">No sampling plan configured for {lot.item.category.name}.</p>}

          {details.inspections.length > 0 ? (
            <ul className="mt-4 space-y-1 text-sm">
              {details.inspections.map((i) => (
                <li key={i.id}>
                  <Badge tone={i.disposition === "Approved" ? "green" : "red"}>{i.disposition}</Badge> by {i.inspectedBy.name} on{" "}
                  {formatDateTime(i.inspectedAt)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Not inspected yet. The guided F.WD.003 inspection form arrives in build step 5.
            </p>
          )}
        </Card>

        <Card title="Release" id="release">
          {lot.qcStatus === "Released" ? (
            <p className="text-sm">
              Released by {details.releasedBy?.name ?? "—"} on {formatDateTime(lot.releasedAt ?? lot.createdAt)}.
            </p>
          ) : lot.qcStatus === "Rejected" ? (
            <p className="text-sm text-red-700">Rejected — this lot cannot be used.</p>
          ) : (
            <>
              <ul className="space-y-1 text-sm">
                <li>{lastInspection?.disposition === "Approved" ? "✓" : "✕"} Inspection approved (F.WD.003)</li>
                <li>
                  {progress.missingBeforeRelease === 0 ? "✓" : "✕"} All before-release requirements met
                  {progress.missingBeforeRelease > 0 && ` (${progress.missingBeforeRelease} missing)`}
                </li>
                <li>✕ Release sticker placed over the quarantine sticker</li>
              </ul>
              <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
                Only QC can release. The release sign-off arrives in build step 6.
              </p>
            </>
          )}
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-base font-semibold">Transactions</h2>
      <Table head={["Date", "Type", "Qty", "Balance", "Cost", "Room", "Product / customer", "By", "Notes"]}>
        {details.transactions.reduce<{ rows: React.ReactNode[]; running: number }>(
          (acc, t) => {
            acc.running += t.qty;
            acc.rows.push(
              <tr key={t.id}>
                <td className="whitespace-nowrap px-4 py-2">{formatDate(t.date)}</td>
                <td className="px-4 py-2">{transactionTypeLabel(t.type)}</td>
                <td className={`px-4 py-2 tabular-nums ${t.qty < 0 ? "text-red-700" : "text-emerald-700"}`}>
                  {t.qty > 0 ? "+" : ""}
                  {t.qty.toLocaleString()}
                </td>
                <td className="px-4 py-2 tabular-nums">{acc.running.toLocaleString()}</td>
                <td className="px-4 py-2 tabular-nums">{unitCost !== null ? formatMoney(Math.abs(t.qty) * unitCost, 2) : "—"}</td>
                <td className="px-4 py-2">{t.room?.name ?? "—"}</td>
                <td className="px-4 py-2">{t.productOrCustomer ?? "—"}</td>
                <td className="px-4 py-2">{t.operator.name}</td>
                <td className="px-4 py-2 text-slate-600">{t.notes}</td>
              </tr>,
            );
            return acc;
          },
          { rows: [], running: 0 },
        ).rows}
      </Table>

      <h2 className="mb-3 mt-8 text-base font-semibold">Audit history</h2>
      <AuditHistory
        scopes={[
          { table: "Lot", ids: [lot.id] },
          { table: "Receipt", ids: [lot.receiptId] },
          { table: "Document", ids: [...details.documents, ...details.receipt.documents].map((d) => d.id) },
          { table: "InventoryTransaction", ids: details.transactions.map((t) => t.id) },
          { table: "Inspection", ids: details.inspections.map((i) => i.id) },
        ]}
      />
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function NextStep({
  next,
  role,
  fixLink,
  fixLabel,
  sampleSize,
}: {
  next: string;
  role?: string;
  fixLink: string | null;
  fixLabel?: string;
  sampleSize?: number;
}) {
  const isQc = role === "qc" || role === "admin";
  switch (next) {
    case "finish_receiving":
    case "complete_missing":
      return fixLink ? (
        <Link href={fixLink} className={`${buttonClass} mt-3`}>
          Fix: {fixLabel}
        </Link>
      ) : null;
    case "inspect":
      return (
        <p className="mt-2 text-sm text-slate-600">
          {isQc ? "You" : "QC"} {isQc ? "need" : "needs"} to inspect this lot
          {sampleSize ? ` — draw ${sampleSize.toLocaleString()} samples` : ""}.{" "}
          <Link href="#inspection" className="text-sky-700 hover:underline">
            See the sampling plan
          </Link>
        </p>
      );
    case "release":
    case "reject":
      return (
        <p className="mt-2 text-sm text-slate-600">
          {isQc ? "You can" : "QC can"} {next === "release" ? "release" : "reject"} this lot.{" "}
          <Link href="#release" className="text-sky-700 hover:underline">
            Go to release
          </Link>
        </p>
      );
    case "in_use":
      return <p className="mt-2 text-sm text-slate-600">Record usage as the lot is used (usage entry arrives in build step 6).</p>;
    default:
      return null;
  }
}
