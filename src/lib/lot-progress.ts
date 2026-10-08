// Where a lot is in Receive → Quarantine → Inspect → Release → In use,
// and what the next thing to do is. Pure, so lists and pages agree.

import { stageCounts, type CheckSummary } from "./completeness";

export const LOT_STEPS = ["Receive", "Quarantine", "Inspect", "Release", "In use"] as const;

export type StepState = "done" | "current" | "upcoming" | "failed";

export type NextAction =
  | "finish_receiving"
  | "inspect"
  | "complete_missing"
  | "release"
  | "reject"
  | "in_use"
  | "used_up"
  | "rejected";

export type LotProgress = {
  states: StepState[];
  current: number;
  next: NextAction;
  nextLabel: string;
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Every number here comes from stageCounts / summary (countResults), the same
// calculation the checklist and the Release panel show.
export function lotProgress(lot: {
  qcStatus: string;
  summary: CheckSummary;
  lastInspection?: { disposition: string | null } | null; // last confirmed inspection
  balance: number;
}): LotProgress {
  // a category without an inspection requirement goes straight to release review
  const inspectionRequired = lot.summary.results.some((r) => r.req.source === "inspection");
  const build = (current: number, next: NextAction, nextLabel: string, failed = false): LotProgress => ({
    states: LOT_STEPS.map((_, i) => (i < current ? "done" : i === current ? (failed ? "failed" : "current") : "upcoming")),
    current,
    next,
    nextLabel,
  });

  if (lot.qcStatus === "Rejected") return build(3, "rejected", "Rejected — do not use", true);
  if (lot.qcStatus === "Released")
    return lot.balance > 0
      ? build(4, "in_use", "Released — record usage as it is used")
      : { ...build(4, "used_up", "Used up"), states: LOT_STEPS.map(() => "done") };

  // In quarantine: the lot is on hold, so the Quarantine step itself counts as reached.
  // Blank or wrong receiving answers come first; a follow-up (e.g. a shortage) does not stop inspection.
  const receivingMissing = stageCounts(lot.summary, "at_receiving").open.filter((r) => r.status === "missing").length;
  if (receivingMissing) return build(0, "finish_receiving", `Finish receiving (${receivingMissing} missing)`);
  if (!lot.lastInspection && inspectionRequired) return build(2, "inspect", "Inspect (F.WD.003)");
  if (lot.lastInspection && lot.lastInspection.disposition !== "Approved") return build(3, "reject", "Inspection failed — reject the lot (QC authorized)");
  const open = lot.summary.open.length;
  if (open) return build(3, "complete_missing", `Resolve ${plural(open, "open requirement")}, then release`);
  return build(3, "release", "Ready to release");
}
