import { test } from "node:test";
import assert from "node:assert/strict";
import { itemStock, lotLedger, readStockChange } from "./stock";

test("lot balance = received − used − loss − scrap ± count adjustment", () => {
  const l = lotLedger([
    { type: "receive", qty: 1000 },
    { type: "production_use", qty: -300 },
    { type: "sample", qty: -5 },
    { type: "loss", qty: -20 },
    { type: "scrap", qty: -15 },
    { type: "count_adjustment", qty: -12 },
    { type: "count_adjustment", qty: 4 },
  ]);
  assert.deepEqual(l, { received: 1000, used: 305, loss: 20, scrap: 15, countAdjustment: -8, balance: 652 });
  assert.equal(l.received - l.used - l.loss - l.scrap + l.countAdjustment, l.balance);
});

test("loss and scrap: positive whole number stored negative; reason required", () => {
  assert.deepEqual(readStockChange({ type: "loss", qty: "20", reason: "Box crushed in transit" }, 100), {
    type: "loss",
    qty: -20,
    reason: "Box crushed in transit",
    fieldErrors: {},
  });
  assert.ok(readStockChange({ type: "scrap", qty: "5", reason: "  " }, 100).fieldErrors.reason);
  assert.ok(readStockChange({ type: "scrap", qty: "-5", reason: "x" }, 100).fieldErrors.qty);
  assert.ok(readStockChange({ type: "loss", qty: "0", reason: "x" }, 100).fieldErrors.qty);
  assert.match(readStockChange({ type: "loss", qty: "101", reason: "x" }, 100).fieldErrors.qty, /cannot go below 0/);
  assert.ok(readStockChange({ type: "production_use", qty: "1", reason: "x" }, 100).fieldErrors.type);
});

test("count adjustment: signed, not zero, balance stays ≥ 0", () => {
  assert.equal(readStockChange({ type: "count_adjustment", qty: "+5", reason: "Recount" }, 10).qty, 5);
  assert.equal(readStockChange({ type: "count_adjustment", qty: "-10", reason: "Recount" }, 10).qty, -10);
  assert.ok(readStockChange({ type: "count_adjustment", qty: "0", reason: "Recount" }, 10).fieldErrors.qty);
  assert.ok(readStockChange({ type: "count_adjustment", qty: "-11", reason: "Recount" }, 10).fieldErrors.qty);
});

test("item stock: only released lots are available; quarantine apart; rejected in neither", () => {
  const s = itemStock([
    { qcStatus: "Released", balance: 100, expDate: new Date("2027-03-01"), location: "1241 Alderwood" },
    { qcStatus: "Released", balance: 50, expDate: new Date("2026-12-01"), location: "1283 Alviso" },
    { qcStatus: "Released", balance: 0, expDate: new Date("2026-11-10"), location: "1283 Alviso" }, // used up
    { qcStatus: "Quarantine", balance: 40, expDate: new Date("2026-11-20"), location: "1241 Alderwood" },
    { qcStatus: "Rejected", balance: 999, expDate: null, location: "1283 Alviso" },
  ]);
  assert.equal(s.available, 150);
  assert.equal(s.quarantine, 40);
  assert.equal(s.nearestExpiry?.toISOString().slice(0, 10), "2026-12-01");
  assert.deepEqual(s.locations, ["1241 Alderwood", "1283 Alviso"]);
});
