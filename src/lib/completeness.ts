// Completeness engine (spec §3): "what's missing" for a lot, item or supplier.
//
// Pure functions over plain data, so the same rules run on the server (lot
// pages, dashboard, to-do list) and in the browser (receiving wizard review).
// The rules themselves are data: Category.config for lots and items,
// SUPPLIER_REQUIREMENTS below for suppliers.

import type { Requirement, Stage } from "./category-config";

export type Facts = {
  item?: Record<string, unknown>; // specs already parsed into an object
  receipt?: Record<string, unknown>;
  lot?: Record<string, unknown>;
  supplier?: Record<string, unknown>;
  // document types on file, per record they are attached to
  documents: Partial<Record<"item" | "receipt" | "lot" | "supplier", string[]>>;
  inspections?: { disposition: string }[];
  // a rejected lot will never be released, so release paperwork no longer applies
  lotRejected?: boolean;
};

export type CheckStatus = "done" | "missing" | "na";

export type CheckResult = {
  req: Requirement;
  stage: Stage | "item" | "supplier";
  status: CheckStatus;
  detail?: string;
};

export type CheckSummary = {
  results: CheckResult[];
  met: number;
  total: number; // excludes not-applicable lines
  missing: CheckResult[];
  complete: boolean;
};

// TODO(confirm with QA): whether customer-supplied suppliers need all three.
export const SUPPLIER_REQUIREMENTS: Requirement[] = [
  {
    key: "questionnaire",
    label: "Supplier questionnaire",
    source: "document",
    documentType: "Supplier questionnaire",
    attachedTo: "supplier",
    ref: "F.QC.009",
    owner: "qc",
  },
  {
    key: "agreement",
    label: "Supplier agreement",
    source: "document",
    documentType: "Supplier agreement",
    attachedTo: "supplier",
    ref: "F.QC.015",
    owner: "qc",
  },
  {
    key: "aslApproved",
    label: "ASL approval",
    source: "field",
    path: "supplier.aslApproved",
    requireTrue: true,
    ref: "F.QC.010",
    owner: "qc",
  },
];

export function ownerOf(req: Requirement) {
  return req.owner ?? (req.source === "inspection" ? "qc" : "warehouse");
}

function getPath(facts: Facts, path: string): unknown {
  let v: unknown = facts;
  for (const part of path.split(".")) {
    if (v === null || v === undefined || typeof v !== "object") return undefined;
    v = (v as Record<string, unknown>)[part];
  }
  return v;
}

function isFilled(v: unknown, requireTrue?: boolean) {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (typeof v === "boolean") return requireTrue ? v : true;
  if (typeof v === "number") return !Number.isNaN(v);
  return true;
}

function checkOne(req: Requirement, facts: Facts): { done: boolean; detail?: string } {
  switch (req.source) {
    case "field": {
      const paths = req.anyOf ?? (req.path ? [req.path] : []);
      return { done: paths.some((p) => isFilled(getPath(facts, p), req.requireTrue)) };
    }
    case "document": {
      const onFile = facts.documents[req.attachedTo ?? "lot"] ?? [];
      const wanted = req.anyOf ?? (req.documentType ? [req.documentType] : []);
      const found = wanted.find((t) => onFile.includes(t));
      return { done: !!found, detail: found && wanted.length > 1 ? found : undefined };
    }
    case "inspection": {
      const last = facts.inspections?.at(-1);
      return { done: !!last, detail: last?.disposition };
    }
  }
}

export function evaluate(
  stage: CheckResult["stage"],
  requirements: Requirement[],
  facts: Facts,
): CheckResult[] {
  return requirements.map((req) => {
    const { done, detail } = checkOne(req, facts);
    let status: CheckStatus = done ? "done" : "missing";
    if (!done && facts.lotRejected && stage === "before_release") status = "na";
    return { req, stage, status, detail };
  });
}

export function summarize(results: CheckResult[]): CheckSummary {
  const applicable = results.filter((r) => r.status !== "na");
  const missing = applicable.filter((r) => r.status === "missing");
  return {
    results,
    met: applicable.length - missing.length,
    total: applicable.length,
    missing,
    complete: missing.length === 0,
  };
}

export function evaluateLot(requirements: Record<Stage, Requirement[]>, facts: Facts) {
  return summarize([
    ...evaluate("at_receiving", requirements.at_receiving, facts),
    ...evaluate("before_release", requirements.before_release, facts),
  ]);
}

export const STAGE_LABELS: Record<CheckResult["stage"], string> = {
  at_receiving: "At receiving",
  before_release: "Before release",
  item: "Item",
  supplier: "Supplier",
};
