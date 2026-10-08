// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Requirement, Stage as ReqStage } from "./category-config";
import { evaluateLot, type Facts } from "./completeness";
import { lotWorkflow, queueTask, type WorkflowInput } from "./workflow";

// A trimmed copy of the Lids rules in prisma/seed.ts.
const LIDS: Record<ReqStage, Requirement[]> = {
  at_receiving: [
    {
      key: "quarantineSticker",
      label: "Quarantine sticker on every box",
      source: "field",
      path: "receipt.quarantineStickerApplied",
      expect: "yes",
      task: "Confirm quarantine labels are applied to every box",
    },
    {
      key: "qtyMatch",
      label: "Total matches packing list / PO",
      source: "field",
      path: "receipt.qtyMatchesPackingList",
      expect: "yes",
      followUp: { note: "receipt.qtyMatchNote", resolvedBy: "receipt.qtyDiffResolution", owner: "qc" },
      followUpTask: "Resolve quantity difference with packing list / PO",
    },
  ],
  before_release: [
    { key: "unitCost", label: "Unit cost", source: "field", path: "lot.unitCost", task: "Enter unit cost" },
    { key: "packingListOrCoa", label: "Packing list / COA", source: "document", attachedTo: "lot", anyOf: ["Packing list", "COA"] },
    { key: "inspection", label: "Incoming inspection", source: "inspection", owner: "qc" },
  ],
};
const NO_INSPECTION: Record<ReqStage, Requirement[]> = { at_receiving: [], before_release: [LIDS.before_release[0]] };

type Over = { receipt?: object; lot?: object; docs?: string[]; inspection?: string; qcStatus?: string; draft?: boolean; balance?: number };

function input(o: Over = {}, reqs = LIDS): WorkflowInput {
  const facts: Facts = {
    receipt: { quarantineStickerApplied: true, qtyMatchesPackingList: true, ...o.receipt },
    lot: { unitCost: "0.01", ...o.lot },
    documents: { lot: o.docs ?? ["COA"] },
    inspections: o.inspection ? [{ disposition: o.inspection }] : [],
    lotRejected: o.qcStatus === "Rejected",
  };
  return {
    lotId: 7,
    itemId: 3,
    supplierId: 2,
    qcStatus: o.qcStatus ?? "Quarantine",
    summary: evaluateLot(reqs, facts),
    lastInspection: o.inspection ? { disposition: o.inspection } : null,
    hasDraft: !!o.draft,
    balance: o.balance ?? 100,
  };
}
const QC = { qcAuthorized: true };
const OTHER = { qcAuthorized: false };

test("receiving incomplete: stage receiving, in inspection and follow-up queues, current task fixes receiving", () => {
  const wf = lotWorkflow(input({ receipt: { quarantineStickerApplied: false } }), OTHER);
  assert.equal(wf.stage, "receiving");
  assert.deepEqual(wf.queues, { inspection: true, release: false, followup: true });
  assert.equal(wf.current.label, "Confirm quarantine labels are applied to every box");
  assert.equal(wf.current.href, "/lots/7?fix=quarantineSticker");
  const insp = queueTask("inspection", wf, input({ receipt: { quarantineStickerApplied: false } }), OTHER);
  assert.equal(insp.label, "Enter inspection results");
  assert.equal(insp.blocker, "Receiving incomplete (1)");
});

test("not inspected: anyone enters results; a draft waits for QC confirmation", () => {
  assert.equal(lotWorkflow(input(), OTHER).current.label, "Enter inspection results");
  assert.equal(lotWorkflow(input(), OTHER).current.canDo, true);
  const draftOther = lotWorkflow(input({ draft: true }), OTHER);
  assert.equal(draftOther.current.canDo, false);
  assert.equal(draftOther.current.waitingFor, "QC confirmation");
  assert.equal(draftOther.cache.wfInspectionDraft, true);
  const draftQc = lotWorkflow(input({ draft: true }), QC);
  assert.deepEqual([draftQc.current.label, draftQc.current.href], ["Confirm inspection", "/lots/7?tab=inspection"]);
});

test("a draft never counts: the lot stays in the inspection queue and release is not offered", () => {
  const wf = lotWorkflow(input({ draft: true }), QC);
  assert.equal(wf.stage, "inspection");
  assert.equal(wf.queues.release, false);
});

test("approved with missing documents: release review, blocked, first task offered", () => {
  const wf = lotWorkflow(input({ inspection: "Approved", docs: [] }), OTHER);
  assert.equal(wf.stage, "release");
  assert.equal(wf.releaseBlocked, true);
  assert.equal(wf.queues.inspection, false);
  assert.equal(wf.current.label, "Upload packing list / COA");
  assert.equal(wf.current.blocker, "1 release requirement remains");
  assert.match(wf.current.sentence, /Inspection approved — release requirements remain \(1\)/);
});

test("approved, only a QC follow-up left: others wait, QC resolves", () => {
  const o = { inspection: "Approved", receipt: { qtyMatchesPackingList: false, qtyMatchNote: "short" } };
  const other = lotWorkflow(input(o), OTHER);
  assert.equal(other.current.canDo, false);
  assert.equal(other.cache.wfFollowupQcOnly, true);
  assert.equal(lotWorkflow(input(o), QC).current.href, "/lots/7?fix=qtyMatch");
});

test("approved and complete: QC reviews for release; others wait", () => {
  const qc = lotWorkflow(input({ inspection: "Approved" }), QC);
  assert.deepEqual([qc.current.label, qc.current.href], ["Review for release", "/lots/7?do=release"]);
  assert.equal(qc.releaseBlocked, false);
  assert.equal(lotWorkflow(input({ inspection: "Approved" }), OTHER).current.waitingFor, "QC release review");
});

test("failed inspection leaves the inspection queue; QC reviews for rejection", () => {
  const wf = lotWorkflow(input({ inspection: "Rejected" }), QC);
  assert.equal(wf.stage, "failed");
  assert.deepEqual(wf.queues, { inspection: false, release: true, followup: false });
  assert.equal(wf.current.href, "/lots/7?do=reject");
});

test("released, depleted and rejected lots are in no work queue", () => {
  const released = lotWorkflow(input({ qcStatus: "Released", inspection: "Approved" }), OTHER);
  assert.equal(released.stage, "released");
  assert.deepEqual([released.current.label, released.current.href], ["Record usage", "/lots/7?do=usage"]);
  const depleted = lotWorkflow(input({ qcStatus: "Released", inspection: "Approved", balance: 0 }), OTHER);
  assert.equal(depleted.stage, "depleted");
  const rejected = lotWorkflow(input({ qcStatus: "Rejected", inspection: "Rejected" }), OTHER);
  assert.equal(rejected.stage, "rejected");
  for (const wf of [released, depleted, rejected]) assert.deepEqual(wf.queues, { inspection: false, release: false, followup: false });
});

test("a category without an inspection requirement goes straight to release review", () => {
  const wf = lotWorkflow(input({}, NO_INSPECTION), QC);
  assert.equal(wf.inspectionRequired, false);
  assert.equal(wf.queues.inspection, false);
  assert.equal(wf.current.label, "Review for release");
  assert.match(wf.current.sentence, /No incoming inspection is configured/);
});
