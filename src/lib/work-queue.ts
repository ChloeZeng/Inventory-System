// Home page work queue: one entry per lot that needs attention, with its open
// tasks grouped under it, an explained readiness, and one primary action.
//
// Everything here is derived from the existing rules — the completeness engine
// (requirements), lotProgress (stage) and the QC authorization flag. Nothing is
// added to what release or inspection require. Rules the code does not define
// are stated as such instead of guessed (see INSPECTION_DEPENDENCY_NOTE).

import { prisma } from "./prisma";
import type { Requirement } from "./category-config";
import { ownerOfOpen, type CheckResult, type CheckSummary } from "./completeness";
import { loadAnsiTables, samplingPlan } from "./sampling";
import { LOT_INCLUDE, fixHrefFor, itemChecklist, lotLabel, lotStatus, supplierChecklist } from "./records";

export type Stage = "inspection" | "inspection_failed" | "release";
export type Readiness = "ready" | "blocked" | "pending";
export type Area = "Receiving" | "Documents" | "Release paperwork" | "Inspection";

export type WorkTask = {
  key: string;
  label: string; // imperative, e.g. "Enter unit cost"
  area: Area;
  status: "missing" | "followup";
  detail?: string;
  ref?: string;
  href: string;
  qcOnly: boolean;
  canDo: boolean; // current user may do it (QC-only tasks need QC authorization)
};

export type AreaStatus = { label: string; value: string; tone: "ok" | "open" | "neutral" | "bad" };

export type WorkLot = {
  lotId: number;
  lotLabel: string;
  itemId: number;
  itemCode: string;
  itemName: string;
  receivingNo: string;
  supplierName: string;
  dateReceived: Date;
  stage: Stage;
  stageLabel: string;
  readiness: Readiness;
  reason: string; // why this readiness — the sentence shown under the lot
  dependencyNote?: string; // how open receiving items relate to inspection / release
  primary: { label: string; href: string } | null; // null: nothing this user can do now
  blocked: boolean; // a known prerequisite prevents the stage's action (counted in "Blocked")
  areas: AreaStatus[];
  tasks: WorkTask[];
  sampling?: string; // only when an ANSI plan exists for the category
};

// Inspection results cannot be recorded yet (build step 5), and no rule says whether
// open receiving items must be closed before inspecting. Shown to users verbatim.
export const INSPECTION_DEPENDENCY_NOTE =
  "Open receiving items must be completed before release. The system does not define whether inspection may start first.";

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

type LotInput = {
  lotId: number;
  lotLabel: string;
  item: { id: number; code: string; name: string };
  receivingNo: string;
  supplierId: number;
  supplierName: string;
  dateReceived: Date;
  summary: CheckSummary;
  lastInspection: { disposition: string } | null;
  plan: { sampleSize: number; lotSize: number; hundredPercent: boolean } | null;
};

// Pure: one lot in quarantine → its work-queue entry for this user.
export function buildWorkLot(input: LotInput, user: { qcAuthorized: boolean }): WorkLot {
  const { summary, lastInspection } = input;
  const ctx = { lotId: input.lotId, itemId: input.item.id, supplierId: input.supplierId };

  const tasks: WorkTask[] = summary.open.map((r) => {
    const qcOnly = ownerOfOpen(r) === "qc";
    return {
      key: r.req.key,
      label: taskLabel(r),
      area: areaOf(r),
      status: r.status === "followup" ? "followup" : "missing",
      detail: r.detail,
      ref: r.req.ref,
      href: fixHrefFor(r, ctx),
      qcOnly,
      canDo: !qcOnly || user.qcAuthorized,
    };
  });
  // the inspection itself is the stage action, not a separate task row
  const workTasks = tasks.filter((t) => t.area !== "Inspection");
  const receivingMissing = summary.open.filter((r) => r.stage === "at_receiving" && r.status === "missing");
  const lotHref = `/lots/${input.lotId}`;

  // ---- per-area statuses (no overall percentage) ----
  const results = summary.results.filter((r) => r.status !== "na");
  const count = (rows: CheckResult[]) => ({ open: rows.filter((r) => r.status !== "done").length, total: rows.length });
  const recv = count(results.filter((r) => areaOf(r) === "Receiving"));
  const docs = count(results.filter((r) => areaOf(r) === "Documents"));
  const areas: AreaStatus[] = [
    {
      label: "Receiving",
      value: `${recv.total - recv.open}/${recv.total} checks done`,
      tone: recv.open ? "open" : "ok",
    },
    {
      label: "Inspection",
      value: lastInspection ? lastInspection.disposition : "Not started",
      tone: !lastInspection ? "neutral" : lastInspection.disposition === "Approved" ? "ok" : "bad",
    },
    { label: "Documents", value: `${docs.total - docs.open} of ${docs.total} on file`, tone: docs.open ? "open" : "ok" },
  ];

  const sampling = input.plan
    ? input.plan.hundredPercent
      ? `Sampling plan: inspect all ${input.plan.lotSize.toLocaleString()} units`
      : `Sampling plan: ${input.plan.sampleSize.toLocaleString()} of ${input.plan.lotSize.toLocaleString()} units`
    : undefined;

  const base = {
    lotId: input.lotId,
    lotLabel: input.lotLabel,
    itemId: input.item.id,
    itemCode: input.item.code,
    itemName: input.item.name,
    receivingNo: input.receivingNo,
    supplierName: input.supplierName,
    dateReceived: input.dateReceived,
    tasks: workTasks,
    sampling,
  };
  const firstDoable = (rows: WorkTask[]) => rows.find((t) => t.canDo && t.status === "missing") ?? rows.find((t) => t.canDo);

  // ---- stage: inspection not yet recorded ----
  if (!lastInspection) {
    const releaseArea: AreaStatus = { label: "Release", value: "After inspection", tone: "neutral" };
    if (receivingMissing.length) {
      // Receiving answers are missing. Completing them is something this user can do now.
      const first = firstDoable(workTasks.filter((t) => t.area === "Receiving" || t.area === "Documents")) ?? firstDoable(workTasks);
      return {
        ...base,
        stage: "inspection",
        stageLabel: "Awaiting inspection",
        readiness: first ? "ready" : "pending",
        reason: `Receiving incomplete: ${receivingMissing.map((r) => lcFirst(r.req.label)).join(", ")}.`,
        dependencyNote: INSPECTION_DEPENDENCY_NOTE,
        primary: first ? { label: "Complete receiving", href: first.href } : null,
        blocked: false,
        areas: [...areas, releaseArea],
      };
    }
    return {
      ...base,
      stage: "inspection",
      stageLabel: "Awaiting inspection",
      readiness: user.qcAuthorized ? "ready" : "pending",
      reason: user.qcAuthorized
        ? "Receiving is complete. Inspect the lot (F.WD.003)."
        : "Receiving is complete. Waiting for a QC-authorized user to inspect (F.WD.003).",
      primary: { label: "Open inspection", href: `${lotHref}?tab=inspection` },
      blocked: false,
      areas: [...areas, releaseArea],
    };
  }

  // ---- stage: inspection recorded but not approved ----
  if (lastInspection.disposition !== "Approved") {
    return {
      ...base,
      stage: "inspection_failed",
      stageLabel: "Inspection failed",
      readiness: user.qcAuthorized ? "ready" : "pending",
      reason: user.qcAuthorized
        ? `Inspection result: ${lastInspection.disposition}. The lot must be rejected.`
        : `Inspection result: ${lastInspection.disposition}. Waiting for a QC-authorized user to reject the lot.`,
      primary: user.qcAuthorized ? { label: "Review for rejection", href: `${lotHref}?do=reject` } : null,
      blocked: false,
      areas: [...areas, { label: "Release", value: "Not possible", tone: "bad" }],
    };
  }

  // ---- stage: inspection approved → release (blocked while any requirement is open) ----
  if (tasks.length) {
    const first = firstDoable(tasks);
    const onlyQc = !first;
    return {
      ...base,
      stage: "release",
      stageLabel: "Awaiting release",
      readiness: "blocked",
      reason: `Release blocked by ${plural(tasks.length, "open task")}: ${tasks.map((t) => lcFirst(t.label)).join("; ")}.`,
      dependencyNote: onlyQc ? "The remaining tasks need a QC-authorized user." : undefined,
      primary: first ? { label: first.label, href: first.href } : null,
      blocked: true,
      areas: [...areas, { label: "Release", value: `Blocked (${tasks.length} open)`, tone: "bad" }],
    };
  }
  return {
    ...base,
    stage: "release",
    stageLabel: "Awaiting release",
    readiness: user.qcAuthorized ? "ready" : "pending",
    reason: user.qcAuthorized
      ? "All requirements are met. Review the lot and confirm the release sticker."
      : "All requirements are met. Waiting for a QC-authorized user to release.",
    primary: user.qcAuthorized ? { label: "Review for release", href: `${lotHref}?do=release` } : { label: "View lot", href: lotHref },
    blocked: false,
    areas: [...areas, { label: "Release", value: "Ready for review", tone: "ok" }],
  };
}

export type MasterDataTask = { kind: "item" | "supplier"; id: number; title: string; missing: string[]; href: string; qcNote?: string };

export type WorkQueue = {
  lots: WorkLot[];
  counts: { inspection: number; release: number; blocked: number; failed: number };
  masterData: MasterDataTask[];
};

// Oldest received first; created time then id as a stable fallback (no due dates or priorities exist).
export async function loadWorkQueue(user: { qcAuthorized: boolean }): Promise<WorkQueue> {
  const [lots, items, suppliers, tables] = await Promise.all([
    prisma.lot.findMany({
      where: { qcStatus: "Quarantine" },
      include: LOT_INCLUDE,
      orderBy: [{ receipt: { dateReceived: "asc" } }, { createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.item.findMany({ where: { active: true }, include: { category: true, documents: { select: { type: true } } }, orderBy: { code: "asc" } }),
    prisma.supplier.findMany({ where: { active: true }, include: { documents: { select: { type: true } } }, orderBy: { name: "asc" } }),
    loadAnsiTables(prisma),
  ]);

  const workLots = lots.map((lot) => {
    const { summary, lastInspection } = lotStatus(lot);
    let plan: LotInput["plan"] = null;
    if (lot.item.category.testPath === "ansi_sampling") {
      try {
        plan = samplingPlan(tables, lot.qtyReceived);
      } catch {
        plan = null; // tables incomplete: say nothing about samples
      }
    }
    return buildWorkLot(
      {
        lotId: lot.id,
        lotLabel: lotLabel(lot),
        item: { id: lot.item.id, code: lot.item.code, name: lot.item.name },
        receivingNo: lot.receipt.receivingNo,
        supplierId: lot.receipt.supplierId,
        supplierName: lot.receipt.supplier.name,
        dateReceived: lot.receipt.dateReceived,
        summary,
        lastInspection,
        plan,
      },
      user,
    );
  });

  // Item and supplier records: distinct work, shown apart from the lots. Item requirements
  // that already appear as a lot task (e.g. a spec sheet blocking a lot) are not repeated.
  const shownOnLots = new Set(workLots.flatMap((l) => l.tasks.map((t) => `${l.itemId}:${t.key}`)));
  const masterData: MasterDataTask[] = [];
  for (const item of items) {
    const missing = itemChecklist(item).open.filter((r) => !shownOnLots.has(`${item.id}:${r.req.key}`));
    if (missing.length)
      masterData.push({ kind: "item", id: item.id, title: `${item.code} ${item.name}`, missing: missing.map((r) => r.req.label), href: `/items/${item.id}` });
  }
  for (const s of suppliers) {
    const missing = supplierChecklist(s).open;
    if (missing.length)
      masterData.push({
        kind: "supplier",
        id: s.id,
        title: s.name,
        missing: missing.map((r) => (r.req.ref ? `${r.req.label} (${r.req.ref})` : r.req.label)),
        href: `/suppliers/${s.id}`,
        qcNote: missing.some((r) => ownerOfOpen(r) === "qc") && !user.qcAuthorized ? "ASL approval requires QC authorization" : undefined,
      });
  }

  return {
    lots: workLots,
    counts: {
      inspection: workLots.filter((l) => l.stage === "inspection").length,
      release: workLots.filter((l) => l.stage === "release").length,
      blocked: workLots.filter((l) => l.blocked).length,
      failed: workLots.filter((l) => l.stage === "inspection_failed").length,
    },
    masterData,
  };
}
