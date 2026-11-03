import { test } from "node:test";
import assert from "node:assert/strict";
import { plural } from "./text";
import { formatQty } from "./category-config";

test("plural: 1 item vs 2 items", () => {
  assert.equal(plural(0, "item"), "0 items");
  assert.equal(plural(1, "item"), "1 item");
  assert.equal(plural(2, "item"), "2 items");
  assert.equal(plural(1200, "lot"), "1,200 lots");
  assert.equal(plural(1, "box", "boxes"), "1 box");
  assert.equal(plural(3, "box", "boxes"), "3 boxes");
});

test("formatQty uses the category unit", () => {
  assert.equal(formatQty(1), "1 unit");
  assert.equal(formatQty(142800, "units"), "142,800 units");
  assert.equal(formatQty(1, "tablets"), "1 tablet");
  assert.equal(formatQty(25, "kg"), "25 kg");
  assert.equal(formatQty(1, "kg"), "1 kg");
});
