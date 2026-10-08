// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { confirmErrors, defectCounts, readInspectionForm } from "./inspection";
import { calculatedDisposition } from "./sampling";

const QUESTIONS = [
  { key: "colorMatches", label: "Color matches standard?" },
  { key: "tapeTest", label: "Tape test passed?" },
];
// lot 106,080 → code N: critical 0.25 → 3/4, major 2.5 → 21/22, minor 4.0 → M 21/22
const PLAN = [
  { cls: "critical", ac: 3, re: 4 },
  { cls: "major", ac: 21, re: 22 },
  { cls: "minor", ac: 21, re: 22 },
];

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}
const complete = {
  itemsSampled: "500",
  defects_critical: "0",
  defects_major: "1",
  defects_minor: "0",
  q_colorMatches: "yes",
  q_tapeTest: "no",
  qc_tapeTest: "major",
};

test("a draft may be incomplete; only formats are checked", () => {
  const { values, fieldErrors } = readInspectionForm(form({ itemsSampled: "120", q_colorMatches: "yes" }), QUESTIONS);
  assert.deepEqual(fieldErrors, {});
  assert.equal(values.itemsSampled, 120);
  assert.equal(values.defects.critical, null);
  assert.deepEqual(readInspectionForm(form({ itemsSampled: "12x" }), QUESTIONS).fieldErrors, { itemsSampled: "Enter a whole number." });
});

test("confirming needs every answer, counts and a disposition", () => {
  const { values } = readInspectionForm(form({ q_colorMatches: "yes" }), QUESTIONS);
  const e = confirmErrors(values, QUESTIONS, { lotSize: 106080, disposition: null, calculated: null, overrideReason: null });
  assert.deepEqual(Object.keys(e).sort(), ["defects_critical", "defects_major", "defects_minor", "disposition", "itemsSampled", "q_tapeTest"]);
});

test("a “No” must carry a defect class and be counted", () => {
  const noClass = readInspectionForm(form({ ...complete, qc_tapeTest: "" }), QUESTIONS).values;
  assert.match(confirmErrors(noClass, QUESTIONS, { lotSize: 106080, disposition: "Approved", calculated: null, overrideReason: null }).q_tapeTest, /pick its class/);
  const uncounted = readInspectionForm(form({ ...complete, defects_major: "0" }), QUESTIONS).values;
  assert.match(confirmErrors(uncounted, QUESTIONS, { lotSize: 106080, disposition: "Approved", calculated: null, overrideReason: null }).defects_major, /At least 1/);
});

test("the calculated result follows Ac/Re; overriding it needs a reason", () => {
  const { values } = readInspectionForm(form(complete), QUESTIONS);
  const calc = calculatedDisposition(PLAN, defectCounts(values));
  assert.equal(calc, "Approved");
  assert.equal(calculatedDisposition(PLAN, { critical: 4, major: 0, minor: 0 }), "Rejected");
  assert.equal(calculatedDisposition(PLAN, { critical: 0, major: 0 }), null, "incomplete counts give no suggestion");
  const ok = { lotSize: 106080, calculated: calc, overrideReason: null };
  assert.deepEqual(confirmErrors(values, QUESTIONS, { ...ok, disposition: "Approved" }), {});
  assert.match(confirmErrors(values, QUESTIONS, { ...ok, disposition: "Rejected" }).overrideReason, /needs a written reason/);
  assert.deepEqual(confirmErrors(values, QUESTIONS, { ...ok, disposition: "Rejected", overrideReason: "Visible cracks" }), {});
});

test("cannot inspect more items than were received", () => {
  const { values } = readInspectionForm(form({ ...complete, itemsSampled: "200000" }), QUESTIONS);
  assert.match(confirmErrors(values, QUESTIONS, { lotSize: 106080, disposition: "Approved", calculated: "Approved", overrideReason: null }).itemsSampled, /More than/);
});
