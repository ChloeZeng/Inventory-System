// Where a lot is in Receive → Quarantine → Inspect → Release → In use,
// and what the next thing to do is. Pure, so lists and pages agree.

import type { CheckSummary } from "./completeness";

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
  missingBeforeRelease: number; // excluding the inspection itself
};

export function lotProgress(lot: {
  qcStatus: string;
  summary: CheckSummary;
  lastInspection?: { disposition: string } | null;
  balance: number;
}): LotProgress {
  const missing = lot.summary.missing;
  const receivingMissing = missing.filter((r) => r.stage === "at_receiving").length;
  const missingBeforeRelease = missing.filter((r) => r.stage === "before_release" && r.req.source !== "inspection").length;

  const build = (current: number, next: NextAction, nextLabel: string, failed = false): LotProgress => ({
    states: LOT_STEPS.map((_, i) => (i < current ? "done" : i === current ? (failed ? "failed" : "current") : "upcoming")),
    current,
    next,
    nextLabel,
    missingBeforeRelease,
  });

  if (lot.qcStatus === "Rejected") return build(3, "rejected", "Rejected — do not use", true);
  if (lot.qcStatus === "Released")
    return lot.balance > 0
      ? build(4, "in_use", "Released — record usage as it is used")
      : { ...build(4, "used_up", "Used up"), states: LOT_STEPS.map(() => "done") };

  // In quarantine: the lot is on hold, so the Quarantine step itself counts as reached.
  if (receivingMissing) return build(0, "finish_receiving", `Finish receiving (${receivingMissing} missing)`);
  if (!lot.lastInspection) return build(2, "inspect", "Inspect (F.WD.003)");
  if (lot.lastInspection.disposition === "Rejected") return build(3, "reject", "Inspection failed — QC to reject");
  if (missingBeforeRelease)
    return build(3, "complete_missing", `Complete ${missingBeforeRelease} missing item${missingBeforeRelease > 1 ? "s" : ""}, then release`);
  return build(3, "release", "Ready to release");
}
