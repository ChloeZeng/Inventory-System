// Material issue (usage form for a production run): the rules, as pure functions so they
// are unit-tested (material-issue.test.ts). The database side is in material-issue-db.ts.
//
//   open       — created: lots picked, planned quantities reserved (stock not yet moved)
//   confirmed  — after production: actual use and loss become transactions, balances update
//   cancelled  — nothing moves; the reservation is released

import { differsFromDedicated } from "./item-fields";

export const ISSUE_STATUSES = ["open", "confirmed", "cancelled"] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export function issueStatusLabel(s: string) {
  return s === "open" ? "Waiting for confirmation" : s === "confirmed" ? "Confirmed" : s === "cancelled" ? "Cancelled" : s;
}

export type PickLot = {
  id: number;
  expDate: Date | null;
  receivedAt: Date;
  available: number; // released balance minus what open issues have reserved
};

// The lot order a material issue suggests: raw ingredients (fefo) earliest expiry first,
// everything else (fifo) oldest received first. Lots with nothing left to pick are left out.
export function orderLots<T extends PickLot>(lots: T[], pickOrder: "fefo" | "fifo"): T[] {
  const byReceived = (a: T, b: T) => a.receivedAt.getTime() - b.receivedAt.getTime() || a.id - b.id;
  const byExpiry = (a: T, b: T) => {
    if (a.expDate && b.expDate) return a.expDate.getTime() - b.expDate.getTime() || byReceived(a, b);
    if (a.expDate) return -1; // a lot with an expiry date goes before one without
    if (b.expDate) return 1;
    return byReceived(a, b);
  };
  return lots.filter((l) => l.available > 0).sort(pickOrder === "fefo" ? byExpiry : byReceived);
}

// The suggested lot: the first in pick order that covers the planned quantity, else the first.
export function suggestLot<T extends PickLot>(lots: T[], pickOrder: "fefo" | "fifo", planned?: number | null): T | null {
  const ordered = orderLots(lots, pickOrder);
  if (!ordered.length) return null;
  if (planned && planned > 0) return ordered.find((l) => l.available >= planned) ?? ordered[0];
  return ordered[0];
}

// ---- Creating ---------------------------------------------------------------------------------

export type LineInput = { itemId: number; lotId: number; plannedQty: string; productReason?: string | null };
export type LineCheck = {
  item?: { id: number; dedicatedProduct: string | null } | null;
  lot?: { id: number; itemId: number; qcStatus: string; available: number } | null;
};

const whole = (s: string | null | undefined) => {
  const t = (s ?? "").replace(/,/g, "").trim();
  return /^\d+$/.test(t) ? Number(t) : null;
};

// Errors for one line, keyed like the form fields (line_<i>_<field>). `reserved` = what earlier
// lines of the same issue already take from the same lot.
export function lineErrors(i: number, line: LineInput, check: LineCheck, product: string | null, reserved: number) {
  const e: Record<string, string> = {};
  const k = (f: string) => `line_${i}_${f}`;
  if (!check.item) e[k("item")] = "Pick an item.";
  if (!check.lot || (check.item && check.lot.itemId !== check.item.id)) e[k("lot")] = "Pick a lot of this item.";
  else if (check.lot.qcStatus !== "Released") e[k("lot")] = "Only released lots can be used.";
  const qty = whole(line.plannedQty);
  if (!qty) e[k("qty")] = "Enter a whole number (1 or more).";
  else if (check.lot && check.lot.qcStatus === "Released" && qty + reserved > check.lot.available)
    e[k("qty")] = `Only ${(check.lot.available - reserved).toLocaleString()} available in this lot.`;
  if (check.item && differsFromDedicated(check.item.dedicatedProduct, product) && !line.productReason?.trim())
    e[k("reason")] = `This item is dedicated to ${check.item.dedicatedProduct}. Give a reason.`;
  return { qty, errors: e };
}

// ---- Confirming --------------------------------------------------------------------------------

export type ConfirmInput = { actual: string; loss: string; returned: string };

export function confirmLine(i: number, planned: number, input: ConfirmInput) {
  const e: Record<string, string> = {};
  const actual = whole(input.actual);
  const loss = whole(input.loss || "0");
  const returned = whole(input.returned || "0");
  if (actual === null) e[`line_${i}_actual`] = "Enter the quantity used (0 if none).";
  if (loss === null) e[`line_${i}_loss`] = "Whole number (0 if none).";
  if (returned === null) e[`line_${i}_returned`] = "Whole number (0 if none).";
  const balanced = actual !== null && loss !== null && returned !== null && actual + loss + returned === planned;
  return { actual, loss, returned, balanced, errors: e };
}
