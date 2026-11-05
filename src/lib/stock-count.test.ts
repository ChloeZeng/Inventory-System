import { test } from "node:test";
import assert from "node:assert/strict";
import { dueMonthlyCounts, lastWorkingDay, nextCountDate, readCountLine } from "./stock-count";

test("last working day of the month (Mon–Fri)", () => {
  assert.equal(lastWorkingDay(2026, 11), "2026-11-30"); // Monday
  assert.equal(lastWorkingDay(2026, 10), "2026-10-30"); // Oct 31 is a Saturday
  assert.equal(lastWorkingDay(2026, 5), "2026-05-29"); // May 31 is a Sunday
  assert.equal(lastWorkingDay(2027, 2), "2027-02-26"); // Feb 28, 2027 is a Sunday
  assert.equal(lastWorkingDay(2028, 2), "2028-02-29"); // leap year, Tuesday
});

test("a monthly count is due from the last working day; last month's always", () => {
  assert.deepEqual(dueMonthlyCounts("2026-11-05"), [{ period: "2026-10", dueDate: "2026-10-30" }]);
  assert.deepEqual(dueMonthlyCounts("2026-11-30"), [
    { period: "2026-10", dueDate: "2026-10-30" },
    { period: "2026-11", dueDate: "2026-11-30" },
  ]);
  assert.deepEqual(dueMonthlyCounts("2027-01-02")[0], { period: "2026-12", dueDate: "2026-12-31" });
  assert.equal(nextCountDate("2026-11-05"), "2026-11-30");
  assert.equal(nextCountDate("2026-10-31"), "2026-11-30"); // Saturday after October's count day
  assert.equal(nextCountDate("2026-12-31"), "2026-12-31");
});

test("counted line: whole number; a difference needs a reason", () => {
  assert.deepEqual(readCountLine(100, "100", ""), { countedQty: 100, difference: 0, reason: null });
  assert.deepEqual(readCountLine(100, "1,050", "Box found behind pallet"), { countedQty: 1050, difference: 950, reason: "Box found behind pallet" });
  assert.deepEqual(readCountLine(100, "98", "  "), { error: "Give the reason for the difference." });
  assert.ok("error" in readCountLine(100, "", null));
  assert.ok("error" in readCountLine(100, "-1", "x"));
  assert.ok("error" in readCountLine(100, "9.5", "x"));
  assert.deepEqual(readCountLine(5, "0", "Lost"), { countedQty: 0, difference: -5, reason: "Lost" });
});
