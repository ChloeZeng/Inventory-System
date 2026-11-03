// Stock calculation. A lot's balance is ALWAYS the sum of its transactions — never typed:
//   balance = received − used − loss − scrap ± count adjustment
// Item stock splits lot balances by QC status: only released lots are available.
// Pure functions (unit-tested in stock.test.ts); the queries live in inventory.ts.

import { STOCK_CHANGE_TYPES, USAGE_TYPES, type StockChangeType } from "./constants";

export type Txn = { type: string; qty: number };

export type Ledger = {
  received: number;
  used: number; // production use, samples, sent to client, damaged / defect (positive number)
  loss: number; // positive number
  scrap: number; // positive number
  countAdjustment: number; // signed; includes legacy "adjustment" rows
  balance: number;
};

export function lotLedger(txns: Txn[]): Ledger {
  const l: Ledger = { received: 0, used: 0, loss: 0, scrap: 0, countAdjustment: 0, balance: 0 };
  for (const t of txns) {
    l.balance += t.qty;
    if (t.type === "receive") l.received += t.qty;
    else if ((USAGE_TYPES as readonly string[]).includes(t.type)) l.used -= t.qty;
    else if (t.type === "loss") l.loss -= t.qty;
    else if (t.type === "scrap") l.scrap -= t.qty;
    else l.countAdjustment += t.qty; // count_adjustment, legacy adjustment
  }
  return l;
}

// A loss, scrap or count adjustment as entered: type, quantity, reason.
// Loss / scrap: a whole number ≥ 1, stored as a negative qty.
// Count adjustment: the signed difference found by counting, e.g. "-12" or "+5" (not 0).
export function readStockChange(input: { type: string | null; qty: string | null; reason: string | null }, balance: number) {
  const fieldErrors: Record<string, string> = {};
  const type = input.type as StockChangeType;
  if (!(STOCK_CHANGE_TYPES as readonly string[]).includes(type ?? "")) fieldErrors.type = "Pick loss, scrap or count adjustment.";
  const raw = (input.qty ?? "").replace(/,/g, "").trim();
  let qty: number | null = null;
  if (type === "count_adjustment") {
    if (!/^[+-]?\d+$/.test(raw) || Number(raw) === 0) fieldErrors.qty = "Enter the difference found, e.g. -12 or +5.";
    else qty = Number(raw);
  } else if (!/^\d+$/.test(raw) || Number(raw) < 1) fieldErrors.qty = "Enter a whole number (1 or more).";
  else qty = -Number(raw);
  const reason = input.reason?.trim() || null;
  if (!reason) fieldErrors.reason = "Give the reason. It is saved in the audit trail.";
  if (qty !== null && balance + qty < 0) fieldErrors.qty = `Only ${balance.toLocaleString()} on hand — the balance cannot go below 0.`;
  return { type, qty, reason, fieldErrors };
}

export type LotStockRow = {
  qcStatus: string;
  balance: number;
  expDate: Date | null;
  location: string;
};

// Item stock: Available counts released lots only; Quarantine is shown apart. Rejected lots
// count in neither. Nearest expiry and locations consider lots that still hold stock.
export function itemStock(lots: LotStockRow[]) {
  const withStock = lots.filter((l) => l.balance > 0);
  const released = withStock.filter((l) => l.qcStatus === "Released");
  const quarantine = withStock.filter((l) => l.qcStatus === "Quarantine");
  const sum = (xs: LotStockRow[]) => xs.reduce((s, l) => s + l.balance, 0);
  const expiries = released.map((l) => l.expDate).filter((d): d is Date => !!d);
  return {
    available: sum(released),
    quarantine: sum(quarantine),
    nearestExpiry: expiries.length ? new Date(Math.min(...expiries.map((d) => d.getTime()))) : null,
    locations: [...new Set([...released, ...quarantine].map((l) => l.location))].sort(),
  };
}

export type ItemStock = ReturnType<typeof itemStock>;
