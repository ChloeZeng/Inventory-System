// Monthly stock count: when it is due, and the rules for one counted line. Pure, so it is
// unit-tested (stock-count.test.ts). Database side: stock-count-db.ts.
//
// Working days are Monday to Friday. TODO(confirm): company holidays (e.g. when the last
// Friday of a month is a holiday) are not known to the system yet.

const iso = (d: Date) => d.toISOString().slice(0, 10);

// "2026-11-30": the last Monday–Friday of the month (month 1–12).
export function lastWorkingDay(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 0)); // day 0 of the next month = last day of this one
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return iso(d);
}

export function periodOf(day: string) {
  return day.slice(0, 7); // "2026-11"
}

// The monthly counts that should exist on `today` ("YYYY-MM-DD", business time zone):
// this month's once its last working day has come, and last month's (in case nobody opened
// the system between that day and the end of the month).
export function dueMonthlyCounts(today: string): { period: string; dueDate: string }[] {
  const [y, m] = today.split("-").map(Number);
  const prev = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  const out = [{ period: `${prev.y}-${String(prev.m).padStart(2, "0")}`, dueDate: lastWorkingDay(prev.y, prev.m) }];
  const due = lastWorkingDay(y, m);
  if (today >= due) out.push({ period: periodOf(today), dueDate: due });
  return out;
}

// The next monthly count date on or after `today`.
export function nextCountDate(today: string) {
  const [y, m] = today.split("-").map(Number);
  const due = lastWorkingDay(y, m);
  return today <= due ? due : m === 12 ? lastWorkingDay(y + 1, 1) : lastWorkingDay(y, m + 1);
}

// One counted lot: a whole number ≥ 0; a difference needs a reason.
export function readCountLine(systemQty: number, counted: string | null | undefined, reason: string | null | undefined) {
  const t = (counted ?? "").replace(/,/g, "").trim();
  if (!/^\d+$/.test(t)) return { error: "Enter the counted quantity (0 if none found)." } as const;
  const countedQty = Number(t);
  const difference = countedQty - systemQty;
  const why = reason?.trim() || null;
  if (difference !== 0 && !why) return { error: "Give the reason for the difference." } as const;
  return { countedQty, difference, reason: difference !== 0 ? why : null } as const;
}
