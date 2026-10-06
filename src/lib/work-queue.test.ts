// Run with: npm test   (node:test via tsx — no extra dependencies)
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Requirement, Stage } from "./category-config";
import { evaluateLot, type Facts } from "./completeness";
import { INSPECTION_DEPENDENCY_NOTE, buildWorkLot, taskLabel } from "./work-queue";

// A trimmed copy of the Lids rules in prisma/seed.ts.
const REQS: Record<Stage, Requirement[]> = {
  at_receiving: [
    { key: "cases", label: "Number of cases", source: "field", path: "lot.cases" },
    {
      key: "qtyMatch",
      label: "Total matches packing list / PO",
      source: "field",
      path: "receipt.qtyMatchesPackingList",
      expect: "yes",
      followUp: { note: "receipt.qtyMatchNote", resolvedBy: "receipt.qtyDiffResolution", owner: "qc" },
      task: "Confirm received quantity matches packing list / PO",
      followUpTask: "Resolve quantity difference with packing list / PO",
    },
    { key: "boxLabelPhoto", label: "Photo of box label", source: "document", documentType: "Photo", attachedTo: "lot" },
    {
      key: "quarantineSticker",
      label: "Quarantine sticker on every box",
      source: "field",
      path: "receipt.quarantineStickerApplied",
      expect: "yes",
      task: "Confirm quarantine labels are applied to every box",
    },
  ],
  before_release: [
    { key: "unitCost", label: "Unit cost", source: "field", path: "lot.unitCost", task: "Enter unit cost" },
    { key: "inspection", label: "Incoming inspection", source: "inspection", owner: "qc" },
  ],
};

function facts(over: { receipt?: object; lot?: object; docs?: string[]; inspection?: string } = {}): Facts {
  return {
    receipt: { qtyMatchesPackingList: true, quarantineStickerApplied: true, ...over.receipt },
    lot: { cases: 10, unitCost: "0.01", ...over.lot },
    documents: { lot: over.docs ?? ["Photo"] },
    inspections: over.inspection ? [{ disposition: over.inspection }] : [],
  };
}

function lot(f: Facts, user = { qcAuthorized: false }) {
  return buildWorkLot(
    {
      lotId: 7,
      lotLabel: "B-1",
      item: { id: 3, code: "C-LID-010", name: "Lid 38mm" },
      receivingNo: "REC-2026-001",
      supplierId: 2,
      supplierName: "Supplier",
      dateReceived: new Date("2026-07-30T00:00:00Z"),
      summary: evaluateLot(REQS, f),
      lastInspection: f.inspections?.at(-1) ?? null,
      plan: null,
    },
    user,
  );
}

const QC = { qcAuthorized: true };

test("incomplete receiving + not inspected: complete receiving first, dependency explained, not blocked", () => {
  const l = lot(facts({ receipt: { quarantineStickerApplied: false } }));
  assert.equal(l.stage, "inspection");
  assert.equal(l.readiness, "ready");
  assert.equal(l.blocked, false);
  assert.deepEqual(l.primary, { label: "Complete receiving", href: "/lots/7?fix=quarantineSticker" });
  assert.match(l.reason, /Receiving incomplete: quarantine sticker on every box/);
  assert.equal(l.dependencyNote, INSPECTION_DEPENDENCY_NOTE);
});

test("receiving complete + not inspected: QC is ready, others are pending; both can open the inspection", () => {
  for (const [user, readiness] of [[QC, "ready"], [{ qcAuthorized: false }, "pending"]] as const) {
    const l = lot(facts(), user);
    assert.equal(l.stage, "inspection");
    assert.equal(l.readiness, readiness);
    assert.deepEqual(l.primary, { label: "Open inspection", href: "/lots/7?tab=inspection" });
    assert.equal(l.tasks.length, 0, "the inspection is the stage action, not a task row");
  }
});

test("approved with open tasks: release blocked, first task is the primary action", () => {
  const l = lot(facts({ lot: { unitCost: null }, docs: [], inspection: "Approved" }));
  assert.equal(l.stage, "release");
  assert.equal(l.readiness, "blocked");
  assert.equal(l.blocked, true);
  assert.deepEqual(l.tasks.map((t) => t.label), ["Upload photo of box label", "Enter unit cost"]);
  assert.deepEqual(l.primary, { label: "Upload photo of box label", href: "/lots/7?fix=boxLabelPhoto" });
  assert.match(l.reason, /Release blocked by 2 open tasks/);
});

test("approved, only a QC follow-up left: non-QC has no action, QC resolves it", () => {
  const f = facts({ receipt: { qtyMatchesPackingList: false, qtyMatchNote: "1 case short" }, inspection: "Approved" });
  const other = lot(f);
  assert.equal(other.readiness, "blocked");
  assert.equal(other.primary, null);
  assert.equal(other.tasks[0].canDo, false);
  assert.equal(other.tasks[0].label, "Resolve quantity difference with packing list / PO");
  const qc = lot(f, QC);
  assert.deepEqual(qc.primary, { label: "Resolve quantity difference with packing list / PO", href: "/lots/7?fix=qtyMatch" });
});

test("approved, nothing open: QC reviews for release, others wait", () => {
  assert.deepEqual(lot(facts({ inspection: "Approved" }), QC).primary, { label: "Review for release", href: "/lots/7?do=release" });
  const other = lot(facts({ inspection: "Approved" }));
  assert.equal(other.readiness, "pending");
  assert.equal(other.blocked, false);
});

test("failed inspection: QC reviews for rejection", () => {
  const l = lot(facts({ inspection: "Rejected" }), QC);
  assert.equal(l.stage, "inspection_failed");
  assert.deepEqual(l.primary, { label: "Review for rejection", href: "/lots/7?do=reject" });
  assert.equal(lot(facts({ inspection: "Rejected" })).primary, null);
});

test("task wording comes from the requirement, follow-ups use their own wording", () => {
  const summary = evaluateLot(REQS, facts({ receipt: { qtyMatchesPackingList: null } }));
  const r = summary.open.find((x) => x.req.key === "qtyMatch")!;
  assert.equal(taskLabel(r), "Confirm received quantity matches packing list / PO");
});

test("area statuses count what they say", () => {
  const l = lot(facts({ receipt: { quarantineStickerApplied: false }, docs: [] }));
  const area = Object.fromEntries(l.areas.map((a) => [a.label, a.value]));
  assert.equal(area.Receiving, "2/3 checks done"); // cases, qtyMatch, sticker — documents are counted apart
  assert.equal(area.Documents, "0 of 1 on file");
  assert.equal(area.Inspection, "Not started");
});
