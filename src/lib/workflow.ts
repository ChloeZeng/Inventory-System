// The one place that decides, for a lot: which stage it is in, which work queues it
// belongs to, and what the current task is for a given user (label, destination,
// whether they may do it, what it is waiting for or blocked by).
//
// Inputs are the existing authoritative rules — the completeness engine (category
// requirements), confirmed inspections, the ledger balance and the QC flag. Server
// actions still enforce everything themselves; this only presents it. Home, the Lots
// list, the lot page and the workflow cache (refreshLotWorkflow) all read from here,
// so they cannot disagree.

import type { Prisma } from "@prisma/client";
import type { Requirement } from "./category-config";
import { ownerOfOpen, type CheckResult, type CheckSummary } from "./completeness";
import { LOT_INCLUDE, fixHrefFor, lotStatus } from "./records";

export type Stage = "receiving" | "inspection" | "release" | "failed" | "released" | "depleted" | "rejected";
export type QueueKey = "inspection" | "release" | "followup";
export type Area = "Receiving" | "Documents" | "Release paperwork" | "Inspection";

export const STAGE_LABELS: Record<Stage, string> = {
  receiving: "Receiving incomplete",
  inspection: "Awaiting inspection",
  release: "Awaiting release",
  failed: "Inspection failed",
  released: "Released",
  depleted: "Used up",
  rejected: "Rejected",
};

export const QUEUES: Record<QueueKey, { label: string; lotsView: string }> = {
  inspection: { label: "Inspection", lotsView: "inspect" },
  release: { label: "Release review", lotsView: "release" },
  followup: { label: "Receiving & documents", lotsView: "followup" },
};

export type WorkTask = {
  key: string;
  label: string; // imperative, e.g. "Enter unit cost"
  area: Area;
  status: "missing" | "followup";
  detail?: string;
  href: string;
  qcOnly: boolean;
  canDo: boolean;
};

export type CurrentTask = {
  label: string; // the action, e.g. "Enter inspection results", "Review for release"
  href: string | null; // where doing it starts (lot page ?tab= / ?fix= / ?do=), null when nothing to open
  canDo: boolean; // this user may do it now
  waitingFor?: string; // e.g. "QC confirmation" — someone else has to act
  blocker?: string; // short reason it cannot finish yet, e.g. "3 release requirements remain"
  sentence: string; // one line for the lot page "What's next"
};

export type Workflow = {
  stage: Stage;
  inspectionRequired: boolean;
  queues: Record<QueueKey, boolean>;
  releaseBlocked: boolean;
  tasks: WorkTask[]; // open requirements except the inspection itself
  balance: number; // from the ledger
  current: CurrentTask;
  cache: Prisma.LotUpdateInput; // the wf* columns
};

export type WorkflowInput = {
  lotId: number;
  itemId: number;
  supplierId: number;
  qcStatus: string;
  summary: CheckSummary;
  lastInspection: { disposition: string | null } | null; // last CONFIRMED inspection
  hasDraft: boolean;
  balance: number;
};

type User = { qcAuthorized: boolean };

const lcFirst = (s: string) => (/^[A-Z][A-Z.]/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function areaOf(r: CheckResult): Area {
  if (r.req.source === "inspection") return "Inspection";
  if (r.req.source === "document") return "Documents";
  return r.stage === "at_receiving" ? "Receiving" : "Release paperwork";
}

// "Enter unit cost", "Confirm quarantine labels are applied to every box", …
export function taskLabel(r: CheckResult): string {
  const req: Requirement = r.req;
  if (r.status === "followup") return req.followUpTask ?? `Resolve: ${lcFirst(req.label)}`;
  if (req.task) return req.task;
  if (req.source === "document") return `Upload ${lcFirst(req.label)}`;
  if (req.source === "inspection") return "Inspect lot";
  if (req.expect === "yes") return `Confirm ${lcFirst(req.label)}`;
  return `Enter ${lcFirst(req.label)}`;
}

export function lotWorkflow(input: WorkflowInput, user: User): Workflow {
  const { summary, lastInspection, qcStatus } = input;
  const lotHref = `/lots/${input.lotId}`;
  const ctx = { lotId: input.lotId, itemId: input.itemId, supplierId: input.supplierId };
  const inspectionRequired = summary.results.some((r) => r.req.source === "inspection");

  const tasks: WorkTask[] = summary.open
    .filter((r) => r.req.source !== "inspection")
    .map((r) => {
      const qcOnly = ownerOfOpen(r) === "qc";
      return {
        key: r.req.key,
        label: taskLabel(r),
        area: areaOf(r),
        status: r.status === "followup" ? "followup" : "missing",
        detail: r.detail,
        href: fixHrefFor(r, ctx),
        qcOnly,
        canDo: !qcOnly || user.qcAuthorized,
      };
    });
  const receivingKeys = new Set(summary.open.filter((r) => r.stage === "at_receiving" && r.status === "missing").map((r) => r.req.key));
  const receivingMissing = tasks.filter((t) => receivingKeys.has(t.key));
  const quarantine = qcStatus === "Quarantine";
  const inspected = !!lastInspection;
  const approved = lastInspection?.disposition === "Approved";

  // ---- stage ----
  let stage: Stage;
  if (qcStatus === "Rejected") stage = "rejected";
  else if (qcStatus === "Released") stage = input.balance > 0 ? "released" : "depleted";
  else if (receivingMissing.length && !inspected) stage = "receiving";
  else if (inspectionRequired && !inspected) stage = "inspection";
  else if (inspected && !approved) stage = "failed";
  else stage = "release";

  const queues: Record<QueueKey, boolean> = {
    inspection: quarantine && inspectionRequired && !inspected,
    release: quarantine && (inspected || !inspectionRequired),
    followup: quarantine && tasks.length > 0,
  };
  // release is blocked while any requirement is open (releaseLot enforces the same)
  const releaseBlocked = queues.release && (approved || !inspectionRequired) && summary.open.length > 0;

  const wf = { stage, inspectionRequired, queues, releaseBlocked, tasks };
  const current = currentTask(wf, input, user, receivingMissing, lotHref);

  return {
    ...wf,
    balance: input.balance,
    current,
    cache: {
      wfStage: stage,
      wfInspection: queues.inspection,
      wfInspectionDraft: queues.inspection && input.hasDraft,
      wfRelease: queues.release,
      wfReleaseBlocked: releaseBlocked,
      wfFollowup: queues.followup,
      wfFollowupQcOnly: tasks.length > 0 && tasks.every((t) => t.qcOnly),
      wfOpenTasks: tasks.length,
      wfBalance: input.balance,
    },
  };
}

type WfCore = Pick<Workflow, "stage" | "inspectionRequired" | "queues" | "releaseBlocked" | "tasks">;

function firstDoable(tasks: WorkTask[]) {
  return tasks.find((t) => t.canDo && t.status === "missing") ?? tasks.find((t) => t.canDo);
}

// The single current task for the lot as a whole (lot page, Lots list).
function currentTask(wf: WfCore, input: WorkflowInput, user: User, receivingMissing: WorkTask[], lotHref: string): CurrentTask {
  switch (wf.stage) {
    case "rejected":
      return { label: "Rejected — do not use", href: null, canDo: false, sentence: "Rejected. Do not use." };
    case "depleted":
      return { label: "Used up", href: null, canDo: false, sentence: "Used up — nothing left on hand." };
    case "released":
      return {
        label: "Record usage",
        href: `${lotHref}?do=usage`,
        canDo: true,
        sentence: `Released — ${input.balance.toLocaleString()} units on hand.`,
      };
    case "receiving": {
      const first = firstDoable(receivingMissing) ?? receivingMissing[0];
      return {
        label: first.label,
        href: first.canDo ? first.href : null,
        canDo: first.canDo,
        waitingFor: first.canDo ? undefined : "QC",
        sentence: `Receiving isn’t complete — ${plural(receivingMissing.length, "answer")} missing.`,
      };
    }
    case "inspection":
      return inspectionTask(input, user, lotHref);
    case "failed":
    case "release":
      return releaseTask(wf, input, user, lotHref);
  }
}

function inspectionTask(input: WorkflowInput, user: User, lotHref: string): CurrentTask {
  const href = `${lotHref}?tab=inspection`;
  if (input.hasDraft)
    return user.qcAuthorized
      ? { label: "Confirm inspection", href, canDo: true, sentence: "Inspection results are saved as a draft — confirm the disposition." }
      : {
          label: "Waiting for QC confirmation",
          href,
          canDo: false,
          waitingFor: "QC confirmation",
          sentence: "Inspection results are saved as a draft — waiting for a QC-authorized user to confirm.",
        };
  return { label: "Enter inspection results", href, canDo: true, sentence: "Waiting for inspection — enter the results (F.WD.003)." };
}

function releaseTask(wf: WfCore, input: WorkflowInput, user: User, lotHref: string): CurrentTask {
  if (wf.stage === "failed") {
    const sentence = `Inspection result: ${input.lastInspection?.disposition} — the lot must be rejected.`;
    return user.qcAuthorized
      ? { label: "Review for rejection", href: `${lotHref}?do=reject`, canDo: true, sentence }
      : { label: "Waiting for QC rejection", href: null, canDo: false, waitingFor: "QC decision", sentence };
  }
  const open = input.summary.open.length;
  if (open) {
    const first = firstDoable(wf.tasks);
    const blocker = `${plural(open, "release requirement")} ${open === 1 ? "remains" : "remain"}`;
    const sentence = wf.inspectionRequired
      ? `Inspection approved — release requirements remain (${open}).`
      : `Release requirements remain (${open}). No incoming inspection is configured for this category.`;
    return first
      ? { label: first.label, href: first.href, canDo: true, blocker, sentence }
      : { label: `Waiting for QC: ${lcFirst(wf.tasks[0]?.label ?? "release")}`, href: null, canDo: false, waitingFor: "QC", blocker, sentence };
  }
  const sentence = wf.inspectionRequired
    ? "Inspection approved — ready for release review."
    : "All requirements met — ready for release review. No incoming inspection is configured for this category.";
  return user.qcAuthorized
    ? { label: "Review for release", href: `${lotHref}?do=release`, canDo: true, sentence }
    : { label: "Waiting for QC release", href: null, canDo: false, waitingFor: "QC release review", sentence };
}

// The task shown for a lot inside one queue (a lot can be in several queues).
export function queueTask(queue: QueueKey, wf: Workflow, input: WorkflowInput, user: User): CurrentTask {
  const lotHref = `/lots/${input.lotId}`;
  if (queue === "inspection") {
    const t = inspectionTask(input, user, lotHref);
    const receivingOpen = wf.tasks.filter((x) => x.area === "Receiving" && x.status === "missing").length;
    return receivingOpen ? { ...t, blocker: `Receiving incomplete (${receivingOpen})` } : t;
  }
  if (queue === "release") return releaseTask(wf, input, user, lotHref);
  const first = firstDoable(wf.tasks) ?? wf.tasks[0];
  const more = wf.tasks.length > 1 ? `+${wf.tasks.length - 1} more` : undefined;
  return first.canDo
    ? { label: first.label, href: first.href, canDo: true, blocker: more, sentence: first.label }
    : { label: `Waiting for QC: ${lcFirst(first.label)}`, href: null, canDo: false, waitingFor: "QC", blocker: more, sentence: first.label };
}

// ---- workflow cache --------------------------------------------------------------------------

type Db = Prisma.TransactionClient;

export function workflowInputFromLot(lot: Parameters<typeof lotStatus>[0]): WorkflowInput {
  const { summary, balance, lastInspection } = lotStatus(lot);
  return {
    lotId: lot.id,
    itemId: lot.itemId,
    supplierId: lot.receipt.supplierId,
    qcStatus: lot.qcStatus,
    summary,
    lastInspection,
    hasDraft: lot._count.inspections > 0,
    balance,
  };
}

// Recompute and store the wf* columns for the lots matching `where`. Call it in the same
// transaction as any change that affects requirements, inspections, status or balance.
export async function refreshLotWorkflow(db: Db, where: Prisma.LotWhereInput, batchSize = 200) {
  let cursor: number | undefined;
  let count = 0;
  for (;;) {
    const lots = await db.lot.findMany({
      where,
      include: LOT_INCLUDE,
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (!lots.length) return count;
    for (const lot of lots) {
      // the cache does not depend on who is looking (QC-only tasks are flagged separately)
      const wf = lotWorkflow(workflowInputFromLot(lot), { qcAuthorized: true });
      await db.lot.update({ where: { id: lot.id }, data: wf.cache });
    }
    count += lots.length;
    cursor = lots.at(-1)!.id;
  }
}
