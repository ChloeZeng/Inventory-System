// Completeness engine (spec §3): "what's missing" for a lot, item or supplier.
//
// Pure functions over plain data, so the same rules run on the server (lot
// pages, dashboard, to-do list) and in the browser (receiving wizard review).
// The rules themselves are data: Category.config for lots and items,
// SUPPLIER_REQUIREMENTS below for suppliers.

import type { Requirement, Stage } from "./category-config";
import { todayDateInput } from "./forms";

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

// done      — answered correctly
// missing   — blank, or a wrong answer (e.g. quarantine sticker: No)
// followup  — a legitimate answer that still needs action before release
//             (e.g. total does not match the packing list; inspection rejected)
// na        — does not apply (e.g. release paperwork on a rejected lot)
export type CheckStatus = "done" | "missing" | "followup" | "na";

export type CheckResult = {
  req: Requirement;
  stage: Stage | "item" | "supplier";
  status: CheckStatus;
  detail?: string;
};

export type CheckCounts = {
  met: number;
  total: number; // excludes not-applicable lines
  open: CheckResult[]; // missing + needs follow-up: everything that is not met
  complete: boolean;
};

export type CheckSummary = CheckCounts & { results: CheckResult[] };

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
    expect: "yes",
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

function isFilled(v: unknown) {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (typeof v === "number") return Number.isFinite(v) && v > 0; // 0 cases, id 0… are not answers
  if (v instanceof Date) return !Number.isNaN(v.getTime());
  return true;
}

// "2026-07-30", an ISO string or a Date (stored as UTC midnight) → "2026-07-30"
function dayOf(v: unknown) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return null;
}

type Check = { status: Exclude<CheckStatus, "na">; detail?: string };

function checkField(req: Requirement, facts: Facts): Check {
  const paths = req.anyOf ?? (req.path ? [req.path] : []);
  const values = paths.map((p) => getPath(facts, p));
  const value = values.find((v) => typeof v === "boolean" || isFilled(v)) ?? values[0];

  if (typeof value === "boolean") {
    if (value) return { status: "done", detail: req.expect === "answered" ? "Yes" : undefined };
    // The answer is No.
    if (req.followUp) {
      const note = req.followUp.note ? getPath(facts, req.followUp.note) : null;
      const resolution = req.followUp.resolvedBy ? getPath(facts, req.followUp.resolvedBy) : null;
      const answered = `Answered No${isFilled(note) ? ` — ${String(note)}` : ""}`;
      return isFilled(resolution)
        ? { status: "done", detail: `${answered}. Resolved: ${String(resolution)}` }
        : { status: "followup", detail: answered };
    }
    if (req.expect === "answered") return { status: "done", detail: "No" };
    return { status: "missing", detail: "Answered No" };
  }

  if (!isFilled(value)) return { status: "missing" };
  if (req.notInFuture) {
    const day = dayOf(value);
    if (day && day > todayDateInput()) return { status: "missing", detail: `${day} is in the future` };
  }
  return { status: "done" };
}

function checkOne(req: Requirement, facts: Facts): Check {
  switch (req.source) {
    case "field":
      return checkField(req, facts);
    case "document": {
      const onFile = facts.documents[req.attachedTo ?? "lot"] ?? [];
      const wanted = req.anyOf ?? (req.documentType ? [req.documentType] : []);
      const found = wanted.find((t) => onFile.includes(t));
      return found ? { status: "done", detail: wanted.length > 1 ? found : undefined } : { status: "missing" };
    }
    case "inspection": {
      // Only an approved inspection satisfies the requirement.
      const last = facts.inspections?.at(-1);
      if (!last) return { status: "missing" };
      if (last.disposition === "Approved") return { status: "done", detail: "Approved" };
      if (facts.lotRejected) return { status: "done", detail: `${last.disposition} — lot rejected` };
      return { status: "followup", detail: `${last.disposition} — QC must reject the lot` };
    }
  }
}

export function evaluate(
  stage: CheckResult["stage"],
  requirements: Requirement[],
  facts: Facts,
): CheckResult[] {
  return requirements.map((req) => {
    const { status, detail } = checkOne(req, facts);
    // A rejected lot will never be released, so open release paperwork no longer applies.
    const na = status !== "done" && facts.lotRejected && stage === "before_release" && req.source !== "inspection";
    return { req, stage, status: na ? "na" : status, detail };
  });
}

// The one place that counts requirements. The completion bar, the checklist's
// stage headings, the Release panel and the lot's next step all use it.
export function countResults(results: CheckResult[]): CheckCounts {
  const applicable = results.filter((r) => r.status !== "na");
  const open = applicable.filter((r) => r.status !== "done");
  return { met: applicable.length - open.length, total: applicable.length, open, complete: open.length === 0 };
}

export function summarize(results: CheckResult[]): CheckSummary {
  return { results, ...countResults(results) };
}

export function stageCounts(summary: CheckSummary, stage: CheckResult["stage"]) {
  return countResults(summary.results.filter((r) => r.stage === stage));
}

// What stands between a quarantined lot and release: every open requirement, from any stage.
// The Release panel shows exactly these numbers, which are the checklist's numbers.
export function releaseReadiness(summary: CheckSummary) {
  const stages = (["at_receiving", "before_release"] as const).map((stage) => ({ stage, ...stageCounts(summary, stage) }));
  return { ready: summary.complete, met: summary.met, total: summary.total, open: summary.open, stages };
}

export function ownerOfOpen(r: CheckResult) {
  return r.status === "followup" && r.req.followUp?.owner ? r.req.followUp.owner : ownerOf(r.req);
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
