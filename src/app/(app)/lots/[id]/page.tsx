import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { parseCategoryConfig, parseSpecs, formatSpecs } from "@/lib/category-config";
import { LOT_DOCUMENT_TYPES, USAGE_TYPES, segregationLabel, supplierTypeLabel, transactionTypeLabel } from "@/lib/constants";
import { releaseReadiness } from "@/lib/completeness";
import { toDateInput, todayDateInput } from "@/lib/forms";
import { parseChecklist } from "@/lib/inspection";
import { lotWorkflow, workflowInputFromLot } from "@/lib/workflow";
import { LOT_INCLUDE, lotLabel, lotStatus } from "@/lib/records";
import { loadAnsiTables, samplingPlan } from "@/lib/sampling";
import { lotNextAction, lotRequirementGroups, type LotFieldValues } from "@/lib/lot-fixes";
import { InspectionForm } from "../inspection-form";
import { InspectionResult } from "../inspection-result";
import { UsageForm } from "../usage-form";
import { Badge, Card, Table, formatDate, formatDateTime, formatMoney, secondaryButtonClass } from "@/components/ui";
import { Stepper } from "@/components/progress";
import { UploadForm } from "@/components/upload-form";
import { AuditHistory } from "@/components/audit-history";
import { QcStatusBadge } from "@/components/qc-status-badge";
import { QcGate } from "@/components/qc-gate";
import { DocumentGallery } from "@/components/document-gallery";
import { DetailHeader, DetailShell, DetailTabs, FlashMessage, type ShellModal } from "@/components/detail/shell";
import { NextActionCard } from "@/components/detail/next-action";
import { RequirementsPanel } from "@/components/detail/requirements-panel";
import { FixForm } from "@/components/detail/fix-form";
import { uploadItemDocument } from "../../items/actions";
import { LotDetailsForm } from "../lot-details-form";
import { ResolveForm } from "../resolve-form";
import { RejectForm, ReleaseForm } from "../qc-decision-forms";
import { recordUsage, rejectLot, releaseLot, resolveQtyDifference, saveInspection, updateLotDetails, uploadLotDocument } from "../actions";

// Lot detail, readable in 10 seconds:
//   top (always visible)  identity · step bar · what's next · open requirements
//   tabs                  Details | Documents | Inspection | History
// Fix buttons open a one-field modal (?fix=<requirement>), release/reject open
// action modals (?do=release|reject); saving refreshes the page data in place.
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

  const [user, details, locations, tables, rooms] = await Promise.all([
    getCurrentUser(),
    prisma.lot.findUniqueOrThrow({
      where: { id },
      include: {
        operator: true,
        releasedBy: true,
        rejectedBy: true,
        receipt: { include: { receivedBy: true, qtyDiffResolvedBy: true, documents: { include: { uploadedBy: true } }, lots: { include: { item: true } } } },
        documents: { include: { uploadedBy: true }, orderBy: { uploadedAt: "desc" } },
        item: { include: { documents: { where: { type: "Spec sheet" }, include: { uploadedBy: true } } } },
        inspections: { include: { inspectedBy: true, confirmedBy: true }, orderBy: { id: "desc" } },
        transactions: { include: { operator: true, room: true }, orderBy: [{ date: "asc" }, { id: "asc" }] },
      },
    }),
    prisma.location.findMany({ orderBy: { name: "asc" } }),
    loadAnsiTables(prisma),
    prisma.room.findMany({ where: { locationId: lot.locationId }, orderBy: { name: "asc" } }),
  ]);

  const { summary, balance, progress, lastInspection } = lotStatus(lot);
  const config = parseCategoryConfig(lot.item.category.config);
  const label = lotLabel(lot);
  const unitCost = lot.unitCost ? Number(lot.unitCost) : null;
  const release = releaseReadiness(summary);
  // QC decisions (disposition, release, reject, resolving QC follow-ups) need QC authorization.
  const isQc = !!user?.qcAuthorized;
  let plan: ReturnType<typeof samplingPlan> | null = null;
  let planError: string | null = null;
  try {
    if (lot.item.category.testPath === "ansi_sampling") plan = samplingPlan(tables, lot.qtyReceived);
  } catch (e) {
    planError = e instanceof Error ? e.message : String(e);
  }

  // ---- top area -----------------------------------------------------------------------
  const values: LotFieldValues = {
    poInvoiceNo: lot.receipt.poInvoiceNo ?? "",
    trackingNo: lot.receipt.trackingNo ?? "",
    qtyMatchesPackingList: lot.receipt.qtyMatchesPackingList === null ? "" : lot.receipt.qtyMatchesPackingList ? "yes" : "no",
    qtyMatchNote: lot.receipt.qtyMatchNote ?? "",
    segregation: lot.receipt.segregation,
    supplierBatchNo: lot.supplierBatchNo ?? "",
    lotNo: lot.lotNo ?? "",
    mfgDate: toDateInput(lot.mfgDate),
    expDate: toDateInput(lot.expDate),
    unitCost: lot.unitCost?.toString() ?? "",
    locationId: String(lot.locationId),
  };
  const groups = lotRequirementGroups(summary, {
    values,
    locations,
    itemCode: lot.item.code,
    receivingNo: lot.receipt.receivingNo,
  });
  // the same workflow selector Home and the Lots list use
  const wf = lotWorkflow(workflowInputFromLot(lot), { qcAuthorized: isQc });
  const next = lotNextAction(wf, {
    rejected: lot.rejectedAt
      ? `Rejected on ${formatDate(lot.rejectedAt)} by ${details.rejectedBy?.name ?? "—"}${lot.rejectionReason ? `: ${lot.rejectionReason}` : ""}. Do not use.`
      : undefined,
  });
  const finalInspection = details.inspections.find((i) => i.status === "final") ?? null;
  const draftInspection = details.inspections.find((i) => i.status === "draft") ?? null;

  const captions = [
    formatDate(lot.receipt.dateReceived),
    lot.qcStatus === "Quarantine" ? "On hold" : "Ended",
    lastInspection ? (lastInspection.disposition ?? undefined) : draftInspection ? "Draft saved" : undefined,
    lot.qcStatus === "Released" ? formatDate(lot.releasedAt) : lot.qcStatus === "Rejected" ? "Rejected" : undefined,
    lot.qcStatus === "Released" ? `${balance.toLocaleString()} left` : undefined,
  ];

  // ---- modals ---------------------------------------------------------------------------
  const saveFields = updateLotDetails.bind(null, lot.id);
  const uploadToLot = uploadLotDocument.bind(null, lot.id);
  const uploadToItem = uploadItemDocument.bind(null, lot.itemId);
  const modals: Record<string, ShellModal> = {};
  if (user) {
    for (const item of groups.flatMap((g) => g.open)) {
      if (item.fix.kind === "tab") continue;
      modals[`fix:${item.key}`] = {
        title: `${item.status === "followup" ? "Resolve" : "Fix"}: ${item.label}`,
        doneMessage: `${item.label} — ${item.status === "followup" ? "resolved" : "saved"}.`,
        body: (
          <FixForm
            spec={item.fix}
            save={saveFields}
            upload={item.fix.kind === "upload" ? (item.fix.target === "item" ? uploadToItem : uploadToLot) : undefined}
            resolve={
              <QcGate authorized={isQc} label="Mark as resolved">
                <ResolveForm action={resolveQtyDifference.bind(null, lot.id)} placeholder="e.g. Supplier credit note CN-123 for 1 short case; PO adjusted" />
              </QcGate>
            }
          />
        ),
      };
    }
    if (lot.qcStatus === "Quarantine") {
      modals["do:release"] = {
        title: `Release lot ${label}`,
        doneMessage: "Lot released.",
        body: (
          <div className="space-y-4">
            <dl className="space-y-1 rounded-md bg-slate-50 px-3 py-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Inspection (F.WD.003)</dt>
                <dd>
                  {finalInspection
                    ? `${finalInspection.disposition} — confirmed by ${finalInspection.confirmedBy?.name ?? "—"}${finalInspection.confirmedAt ? ` on ${formatDate(finalInspection.confirmedAt)}` : ""}`
                    : wf.inspectionRequired
                      ? "Not confirmed"
                      : "Not configured for this category"}
                </dd>
              </div>
              {finalInspection && (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Items inspected · defects (critical / major / minor)</dt>
                  <dd className="tabular-nums">
                    {finalInspection.itemsSampled?.toLocaleString() ?? "—"} · {finalInspection.criticalDefects} / {finalInspection.majorDefects} /{" "}
                    {finalInspection.minorDefects}
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Documents on file</dt>
                <dd>{[...new Set([...details.documents, ...details.receipt.documents, ...details.item.documents].map((d) => d.type))].join(", ") || "None"}</dd>
              </div>
            </dl>
            <p className={`text-sm font-medium ${release.ready ? "text-emerald-700" : "text-red-700"}`}>
              {release.ready ? "✓ All release requirements met" : `✕ ${release.met} of ${release.total} requirements met — ${release.open.length} open`}
            </p>
            <QcGate authorized={isQc} label="Release lot">
              <ReleaseForm action={releaseLot.bind(null, lot.id)} lotLabel={label} ready={release.ready} />
            </QcGate>
          </div>
        ),
      };
      modals["do:reject"] = {
        title: `Reject lot ${label}`,
        doneMessage: "Lot rejected.",
        body: (
          <QcGate authorized={isQc} label="Reject lot" className={`${secondaryButtonClass} border-red-300 text-red-700`}>
            <RejectForm action={rejectLot.bind(null, lot.id)} lotLabel={label} />
          </QcGate>
        ),
      };
    }
    if (wf.stage === "released") {
      modals["do:usage"] = {
        title: `Record usage — lot ${label}`,
        doneMessage: "Usage recorded.",
        body: (
          <UsageForm
            action={recordUsage.bind(null, lot.id)}
            balance={balance}
            unitCost={unitCost}
            types={USAGE_TYPES.map((t) => ({ value: t, label: transactionTypeLabel(t) }))}
            rooms={rooms.map((r) => ({ id: r.id, name: r.name }))}
            today={todayDateInput()}
          />
        ),
      };
    }
  }

  // ---- tabs -------------------------------------------------------------------------------
  const documents = [
    ...details.documents.map((d) => ({ ...d, scope: "This lot" })),
    ...details.receipt.documents.map((d) => ({ ...d, scope: `Delivery ${lot.receipt.receivingNo}` })),
    ...details.item.documents.map((d) => ({ ...d, scope: `Item ${lot.item.code}` })),
  ];
  const otherLots = details.receipt.lots.filter((l) => l.id !== lot.id);

  const detailsTab = (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6">
        <Card title="Lot information">
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
              {lot.receipt.qtyDiffResolution && (
                <div className="text-xs text-slate-500">
                  Resolved by {details.receipt.qtyDiffResolvedBy?.name ?? "—"}
                  {lot.receipt.qtyDiffResolvedAt && ` on ${formatDate(lot.receipt.qtyDiffResolvedAt)}`}: {lot.receipt.qtyDiffResolution}
                </div>
              )}
            </Row>
            {lot.qcStatus === "Released" && (
              <Row label="Released">
                {details.releasedBy?.name ?? "—"}, {formatDateTime(lot.releasedAt ?? lot.createdAt)}
              </Row>
            )}
            {lot.qcStatus === "Rejected" && (
              <Row label="Rejected">
                {details.rejectedBy?.name ?? "—"}
                {lot.rejectedAt && `, ${formatDateTime(lot.rejectedAt)}`}
                {lot.rejectionReason && <div className="text-xs text-slate-500">{lot.rejectionReason}</div>}
              </Row>
            )}
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
        <Card title="Balance and cost">
          <dl className="space-y-2 text-sm">
            <Row label="Received">{lot.qtyReceived.toLocaleString()} units</Row>
            <Row label="Balance on hand">{balance.toLocaleString()} units</Row>
            <Row label="Unit cost">{unitCost !== null ? formatMoney(unitCost) : <span className="text-amber-700">not entered</span>}</Row>
            <Row label="Lot value received">{unitCost !== null ? formatMoney(unitCost * lot.qtyReceived, 2) : "—"}</Row>
            <Row label="Value on hand">{unitCost !== null ? formatMoney(unitCost * balance, 2) : "—"}</Row>
          </dl>
          <p className="mt-3 text-xs text-slate-500">Balance is calculated from the transactions (History tab), never typed.</p>
        </Card>
      </div>

      <Card title="Complete or correct details" className="lg:col-span-2">
        {user ? (
          <LotDetailsForm
            action={saveFields}
            locations={locations}
            initial={{
              receivingNo: lot.receipt.receivingNo,
              lotsOnReceipt: details.receipt.lots.length,
              poInvoiceNo: values.poInvoiceNo,
              trackingNo: values.trackingNo,
              carrierInspectionDone: lot.receipt.carrierInspectionDone,
              qtyMatchesPackingList: lot.receipt.qtyMatchesPackingList,
              qtyMatchNote: values.qtyMatchNote,
              segregation: values.segregation,
              quarantineStickerApplied: lot.receipt.quarantineStickerApplied,
              supplierBatchNo: values.supplierBatchNo,
              lotNo: values.lotNo,
              mfgDate: values.mfgDate,
              expDate: values.expDate,
              unitCost: values.unitCost,
              locationId: lot.locationId,
            }}
          />
        ) : (
          <p className="text-sm text-amber-700">Pick a user in the sidebar to make changes.</p>
        )}
      </Card>
    </div>
  );

  const documentsTab = (
    <div className="space-y-6">
      <DocumentGallery
        docs={documents.map((d) => ({
          id: d.id,
          type: d.type,
          fileName: d.fileName,
          mimeType: d.mimeType,
          scope: d.scope,
          uploadedBy: d.uploadedBy.name,
          uploadedAt: formatDateTime(d.uploadedAt),
        }))}
      />
      {user && (
        <Card title="Upload a document">
          <UploadForm
            key={doc ?? "none"}
            action={uploadToLot}
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
        </Card>
      )}
    </div>
  );

  const inspectionTab = (
    <div className="space-y-6">
      <Card title="Sampling plan (ANSI Z1.4)">
        {plan && (
          <>
            <p className="mb-3 text-sm text-slate-600">
              Lot size {plan.lotSize.toLocaleString()} units · General Level {plan.inspectionLevel} · code letter <strong>{plan.codeLetter}</strong> ·
              draw <strong>{plan.sampleSize.toLocaleString()}</strong>
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
      </Card>

      <Card title="Inspection (F.WD.003)">
        {finalInspection ? (
          <InspectionResult inspection={finalInspection} questions={config.inspectionChecklist} />
        ) : lot.qcStatus !== "Quarantine" ? (
          <p className="text-sm text-slate-600">No confirmed inspection is recorded for this lot.</p>
        ) : !wf.inspectionRequired ? (
          <p className="text-sm text-slate-600">No incoming inspection is configured for {lot.item.category.name}.</p>
        ) : user ? (
          <InspectionForm
            action={saveInspection.bind(null, lot.id)}
            questions={config.inspectionChecklist}
            plan={plan && { classes: plan.classes, sampleSize: plan.sampleSize, lotSize: plan.lotSize, hundredPercent: plan.hundredPercent }}
            qcAuthorized={isQc}
            draft={
              draftInspection && {
                casesSampled: draftInspection.casesSampled,
                itemsSampled: draftInspection.itemsSampled,
                checklist: parseChecklist(draftInspection.checklist),
                defects: { critical: draftInspection.criticalDefects, major: draftInspection.majorDefects, minor: draftInspection.minorDefects },
                defectNotes: draftInspection.defectNotes,
                comments: draftInspection.comments,
                savedBy: draftInspection.inspectedBy.name,
                savedAt: formatDateTime(draftInspection.inspectedAt),
              }
            }
          />
        ) : (
          <p className="text-sm text-amber-700">Pick a user in the sidebar to enter inspection results.</p>
        )}
      </Card>
    </div>
  );

  const historyTab = (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-base font-semibold">Inventory transactions</h2>
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
      </section>
      <section>
        <h2 className="mb-3 text-base font-semibold">Audit history</h2>
        <AuditHistory
          scopes={[
            { table: "Lot", ids: [lot.id] },
            { table: "Receipt", ids: [lot.receiptId] },
            { table: "Document", ids: [...details.documents, ...details.receipt.documents].map((d) => d.id) },
            { table: "InventoryTransaction", ids: details.transactions.map((t) => t.id) },
            { table: "Inspection", ids: details.inspections.map((i) => i.id) },
          ]}
        />
      </section>
    </div>
  );

  return (
    <DetailShell defaultTab="details" modals={modals}>
      {received && (
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
          <span>
            ✓ Received on <span className="font-mono">{lot.receipt.receivingNo}</span> — keep the quarantine stickers on.
          </span>
          <span className="flex flex-wrap gap-3">
            <Link href={`/receive?receipt=${lot.receiptId}`} className="font-medium text-sky-700 hover:underline">
              Add another lot to {lot.receipt.receivingNo}
            </Link>
            <Link href="/receive" className="font-medium text-sky-700 hover:underline">
              New delivery
            </Link>
          </span>
        </div>
      )}

      <DetailHeader
        back={
          <Link href="/lots" className="text-sky-700 hover:underline">
            ← Lots
          </Link>
        }
        title={
          <span>
            Lot <span className="font-mono">{label}</span>
          </span>
        }
        badges={
          <>
            <QcStatusBadge status={lot.qcStatus} />
            {summary.complete && <Badge tone="green">Audit ready</Badge>}
          </>
        }
        meta={
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
        aside={
          <dl className="flex gap-6 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Balance</dt>
              <dd className="font-semibold tabular-nums">
                {balance.toLocaleString()} <span className="font-normal text-slate-500">/ {lot.qtyReceived.toLocaleString()}</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Value on hand</dt>
              <dd className="font-semibold tabular-nums">{unitCost !== null ? formatMoney(unitCost * balance, 2) : "—"}</dd>
            </div>
          </dl>
        }
      />

      <div className="mt-4 space-y-4">
        <Stepper
          states={progress.states}
          captions={captions}
          hrefs={["?tab=details", "?tab=details", "?tab=inspection", "?tab=details", "?tab=history"]}
        />
        <NextActionCard
          sentence={next.sentence}
          tone={next.tone}
          primary={user ? next.primary : undefined}
          secondary={user ? next.secondary : undefined}
          waiting={next.waiting}
          qcAuthorized={isQc}
        />
        <FlashMessage />
        <RequirementsPanel groups={groups} canFix={!!user} />
      </div>

      <div className="mt-8">
        <DetailTabs
          tabs={[
            { key: "details", label: "Details", content: detailsTab },
            { key: "documents", label: "Documents", count: documents.length, content: documentsTab },
            { key: "inspection", label: "Inspection", content: inspectionTab },
            { key: "history", label: "History", content: historyTab },
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
      <dd className="text-right">{children}</dd>
    </div>
  );
}
