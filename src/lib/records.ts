// Loads lots, items and suppliers with what the completeness engine needs,
// and builds the "Fix" links that jump straight to the field or upload.

import type { Prisma } from "@prisma/client";
import { parseCategoryConfig, parseSpecs, type Requirement } from "./category-config";
import {
  SUPPLIER_REQUIREMENTS,
  evaluate,
  evaluateLot,
  summarize,
  type CheckResult,
  type Facts,
} from "./completeness";
import { lotProgress } from "./lot-progress";

const docTypes = { select: { type: true } } as const;

export const LOT_INCLUDE = {
  item: { include: { category: true, documents: docTypes } },
  receipt: { include: { supplier: true, documents: docTypes } },
  location: true,
  documents: docTypes,
  // only confirmed inspections count for requirements, release and queues; drafts are counted apart
  inspections: {
    where: { status: "final" },
    orderBy: [{ confirmedAt: "asc" }, { id: "asc" }],
    select: { id: true, disposition: true, inspectedAt: true, confirmedAt: true },
  },
  transactions: { select: { qty: true } },
  _count: { select: { inspections: { where: { status: "draft" } } } },
} satisfies Prisma.LotInclude;

export type LotWithFacts = Prisma.LotGetPayload<{ include: typeof LOT_INCLUDE }>;

export function lotLabel(lot: { id: number; supplierBatchNo: string | null; lotNo: string | null }) {
  return lot.supplierBatchNo ?? lot.lotNo ?? `Lot #${lot.id}`;
}

export function lotFacts(lot: LotWithFacts): Facts {
  return {
    item: { ...lot.item, specs: parseSpecs(lot.item.specs) },
    receipt: lot.receipt,
    lot: { ...lot, unitCost: lot.unitCost?.toString() ?? null },
    supplier: lot.receipt.supplier,
    documents: {
      item: lot.item.documents.map((d) => d.type),
      receipt: lot.receipt.documents.map((d) => d.type),
      lot: lot.documents.map((d) => d.type),
    },
    inspections: lot.inspections,
    lotRejected: lot.qcStatus === "Rejected",
  };
}

export function lotStatus(lot: LotWithFacts) {
  const config = parseCategoryConfig(lot.item.category.config);
  const summary = evaluateLot(config.requirements, lotFacts(lot));
  const balance = lot.transactions.reduce((sum, t) => sum + t.qty, 0);
  const lastInspection = lot.inspections.at(-1) ?? null;
  const progress = lotProgress({ qcStatus: lot.qcStatus, summary, lastInspection, balance });
  return { summary, balance, lastInspection, progress };
}

export function itemChecklist(item: {
  specs: string;
  category: { config: string };
  documents: { type: string }[];
}) {
  const config = parseCategoryConfig(item.category.config);
  return summarize(
    evaluate("item", config.itemRequirements, {
      item: { specs: parseSpecs(item.specs) },
      documents: { item: item.documents.map((d) => d.type) },
    }),
  );
}

export function supplierChecklist(supplier: { aslApproved: boolean; documents: { type: string }[] }) {
  return summarize(
    evaluate("supplier", SUPPLIER_REQUIREMENTS, {
      supplier,
      documents: { supplier: supplier.documents.map((d) => d.type) },
    }),
  );
}

// ---------------------------------------------------------------------------
// Fix links and to-do wording
// ---------------------------------------------------------------------------

export type FixContext = { lotId?: number; itemId?: number; supplierId?: number };

function docParam(req: Requirement) {
  const type = req.documentType ?? req.anyOf?.[0];
  return type ? `?doc=${encodeURIComponent(type)}` : "";
}

// Lot requirements open the lot page straight into that requirement's Fix modal
// (?fix=<key>); item and supplier requirements go to the field or upload on their page.
export function fixHref(req: Requirement, ctx: FixContext): string {
  if (req.source === "inspection") return `/lots/${ctx.lotId}?tab=inspection`;
  if (req.source === "document") {
    if (req.attachedTo === "item") return `/items/${ctx.itemId}${docParam(req)}#documents`;
    if (req.attachedTo === "supplier") return `/suppliers/${ctx.supplierId}${docParam(req)}#documents`;
    return `/lots/${ctx.lotId}?fix=${req.key}`;
  }
  const path = req.path ?? req.anyOf?.[0] ?? "";
  const [record, ...rest] = path.split(".");
  const field = rest.at(-1);
  if (record === "item") return `/items/${ctx.itemId}#spec_${field}`;
  if (record === "supplier") return `/suppliers/${ctx.supplierId}#field-${field}`;
  return `/lots/${ctx.lotId}?fix=${req.key}`;
}

// A follow-up opens its resolution (a failed inspection: the reject dialog).
export function fixHrefFor(r: CheckResult, ctx: FixContext): string {
  if (r.status === "followup") {
    if (r.req.source === "inspection") return `/lots/${ctx.lotId}?do=reject`;
    if (r.req.followUp) return `/lots/${ctx.lotId}?fix=${r.req.key}`;
  }
  return fixHref(r.req, ctx);
}

export function fixButtonLabel(r: CheckResult) {
  return r.status === "followup" ? "Resolve" : "Fix";
}

// "Upload Packing list / COA", "Enter Unit cost", "Confirm Quarantine sticker on every box"
export function fixVerb(req: Requirement) {
  if (req.source === "document") return "Upload";
  if (req.source === "inspection") return "Inspect";
  if (req.expect === "yes") return "Confirm";
  return "Enter";
}

export function isReceiptLevel(r: CheckResult) {
  const path = r.req.path ?? r.req.anyOf?.[0] ?? "";
  return r.req.attachedTo === "receipt" || path.startsWith("receipt.");
}
