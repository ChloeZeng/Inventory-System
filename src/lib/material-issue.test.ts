import { test } from "node:test";
import assert from "node:assert/strict";
import { confirmLine, lineErrors, orderLots, suggestLot } from "./material-issue";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const lots = [
  { id: 1, expDate: d("2028-01-01"), receivedAt: d("2026-01-10"), available: 100 },
  { id: 2, expDate: d("2026-12-01"), receivedAt: d("2026-06-01"), available: 50 },
  { id: 3, expDate: null, receivedAt: d("2025-12-01"), available: 80 },
  { id: 4, expDate: d("2026-11-20"), receivedAt: d("2026-07-01"), available: 0 }, // nothing left
];

test("raw ingredients: earliest expiry first; others: oldest received first; empty lots left out", () => {
  assert.deepEqual(orderLots(lots, "fefo").map((l) => l.id), [2, 1, 3]);
  assert.deepEqual(orderLots(lots, "fifo").map((l) => l.id), [3, 1, 2]);
});

test("suggestion: first lot in order that covers the planned quantity", () => {
  assert.equal(suggestLot(lots, "fefo")?.id, 2);
  assert.equal(suggestLot(lots, "fefo", 60)?.id, 1); // lot 2 has only 50
  assert.equal(suggestLot(lots, "fefo", 500)?.id, 2); // none covers it: first in order
  assert.equal(suggestLot([], "fifo"), null);
});

test("line: released lots only, quantity within what is available, dedicated product needs a reason", () => {
  const item = { id: 7, dedicatedProduct: "EGUOO-Milk Thistle" };
  const lot = { id: 2, itemId: 7, qcStatus: "Released", available: 50 };
  assert.deepEqual(lineErrors(0, { itemId: 7, lotId: 2, plannedQty: "50" }, { item, lot }, "EGUOO-Milk Thistle", 0).errors, {});
  assert.match(lineErrors(0, { itemId: 7, lotId: 2, plannedQty: "51" }, { item, lot }, "EGUOO-Milk Thistle", 0).errors.line_0_qty, /Only 50/);
  assert.match(lineErrors(1, { itemId: 7, lotId: 2, plannedQty: "20" }, { item, lot }, "EGUOO-Milk Thistle", 40).errors.line_1_qty, /Only 10/);
  assert.match(lineErrors(0, { itemId: 7, lotId: 2, plannedQty: "5" }, { item, lot: { ...lot, qcStatus: "Quarantine" } }, "EGUOO-Milk Thistle", 0).errors.line_0_lot, /released/);
  assert.ok(lineErrors(0, { itemId: 7, lotId: 2, plannedQty: "5" }, { item, lot: { ...lot, itemId: 8 } }, null, 0).errors.line_0_lot);
  assert.match(lineErrors(0, { itemId: 7, lotId: 2, plannedQty: "5" }, { item, lot }, "Other Product", 0).errors.line_0_reason, /dedicated to EGUOO/);
  assert.deepEqual(lineErrors(0, { itemId: 7, lotId: 2, plannedQty: "5", productReason: "Client approved" }, { item, lot }, "Other Product", 0).errors, {});
  assert.ok(lineErrors(0, { itemId: 7, lotId: 2, plannedQty: "0" }, { item, lot }, null, 0).errors.line_0_qty);
});

test("confirm: actual, loss, returned; balanced when they add up to the planned quantity", () => {
  assert.deepEqual(confirmLine(0, 100, { actual: "95", loss: "2", returned: "3" }), { actual: 95, loss: 2, returned: 3, balanced: true, errors: {} });
  const off = confirmLine(0, 100, { actual: "95", loss: "", returned: "" });
  assert.equal(off.balanced, false);
  assert.equal(off.loss, 0);
  assert.ok(confirmLine(0, 100, { actual: "", loss: "0", returned: "0" }).errors.line_0_actual);
  assert.ok(confirmLine(0, 100, { actual: "1.5", loss: "0", returned: "0" }).errors.line_0_actual);
});
