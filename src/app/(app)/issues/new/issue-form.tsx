"use client";

import { startTransition, useActionState, useState } from "react";
import type { ActionState } from "@/lib/forms";
import type { PickItem } from "@/lib/material-issue-db";
import { suggestLot } from "@/lib/material-issue";
import { formatQty } from "@/lib/category-config";
import { differsFromDedicated } from "@/lib/item-fields";
import { Field, FormMessage, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { createIssueAction } from "../actions";

type Line = { key: number; itemId: number | null; lotId: number | null; lotChosen: boolean; qty: string; reason: string };

let nextKey = 1;
const blank = (): Line => ({ key: nextKey++, itemId: null, lotId: null, lotChosen: false, qty: "", reason: "" });
const whole = (s: string) => (/^\d+$/.test(s.replace(/,/g, "").trim()) ? Number(s.replace(/,/g, "").trim()) : null);

// Material issue for a production run: product, batch, date; then one line per item and lot.
// The lot is suggested (raw ingredients: earliest expiry first; others: oldest received first)
// from released lots only, after what open issues and the lines above have reserved.
export function IssueForm({ items, products, clients, today }: { items: PickItem[]; products: string[]; clients: string[]; today: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createIssueAction, {});
  const fe = state.fieldErrors ?? {};
  const [product, setProduct] = useState("");
  const [lines, setLines] = useState<Line[]>([blank()]);

  const itemOf = (id: number | null) => items.find((i) => i.id === id) ?? null;
  // what the lines above already take from each lot
  const takenBefore = (idx: number, lotId: number) =>
    lines.slice(0, idx).reduce((s, l) => s + (l.lotId === lotId ? (whole(l.qty) ?? 0) : 0), 0);
  const lotsFor = (idx: number, item: PickItem) =>
    item.lots.map((l) => ({ ...l, available: l.available - takenBefore(idx, l.id), receivedAt: new Date(l.received), expDate: l.expDate ? new Date(l.expDate) : null, raw: l }));

  function suggest(idx: number, line: Line): Line {
    const item = itemOf(line.itemId);
    if (!item || line.lotChosen) return line;
    const s = suggestLot(lotsFor(idx, item), item.pickOrder, whole(line.qty));
    return { ...line, lotId: s?.id ?? null };
  }
  function update(idx: number, patch: Partial<Line>) {
    setLines((prev) => {
      const next = prev.map((l, i) => (i === idx ? { ...l, ...patch } : l));
      // re-suggest this line and the ones below (their availability depends on it)
      return next.map((l, i) => (i >= idx ? suggest(i, l) : l));
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
      className="space-y-6"
    >
      <input type="hidden" name="lineCount" value={lines.length} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Product" htmlFor="product" required error={fe.product}>
          <input id="product" name="product" list="issue-products" className={inputClass} value={product} onChange={(e) => setProduct(e.target.value)} autoFocus />
          <datalist id="issue-products">
            {products.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Field>
        <Field label="Client" htmlFor="client" hint="Optional">
          <input id="client" name="client" list="issue-clients" className={inputClass} />
          <datalist id="issue-clients">
            {clients.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Production batch no." htmlFor="batchNo" required error={fe.batchNo}>
          <input id="batchNo" name="batchNo" className={inputClass} />
        </Field>
        <Field label="Production date" htmlFor="date" required error={fe.date}>
          <input id="date" name="date" type="date" defaultValue={today} max={today} className={inputClass} />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-slate-800">Materials</legend>
        <ol className="space-y-3">
          {lines.map((line, idx) => {
            const item = itemOf(line.itemId);
            const lots = item ? lotsFor(idx, item) : [];
            const lot = lots.find((l) => l.id === line.lotId) ?? null;
            const suggested = item ? suggestLot(lots, item.pickOrder, whole(line.qty)) : null;
            const qty = whole(line.qty);
            const other = !!item && differsFromDedicated(item.dedicatedProduct, product);
            const err = (f: string) => fe[`line_${idx}_${f}`];
            return (
              <li key={line.key} className="rounded-lg border border-slate-200 bg-white p-3">
                <input type="hidden" name={`line_${idx}_item`} value={line.itemId ?? ""} />
                <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_auto]">
                  <Field label={`Item ${idx + 1}`} htmlFor={`line_${idx}_itemSel`} error={err("item")}>
                    <select
                      id={`line_${idx}_itemSel`}
                      className={inputClass}
                      value={line.itemId ?? ""}
                      onChange={(e) => update(idx, { itemId: Number(e.target.value) || null, lotId: null, lotChosen: false, reason: "" })}
                    >
                      <option value="">Choose an item…</option>
                      {[...new Set(items.map((i) => i.category))].map((cat) => (
                        <optgroup key={cat} label={cat}>
                          {items
                            .filter((i) => i.category === cat)
                            .map((i) => (
                              <option key={i.id} value={i.id}>
                                {i.code} — {i.name}
                              </option>
                            ))}
                        </optgroup>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label="Lot"
                    htmlFor={`line_${idx}_lot`}
                    error={err("lot")}
                    hint={item ? (item.pickOrder === "fefo" ? "Suggested: earliest expiry first" : "Suggested: oldest received first") : "Released lots only"}
                  >
                    <select
                      id={`line_${idx}_lot`}
                      name={`line_${idx}_lot`}
                      className={inputClass}
                      value={line.lotId ?? ""}
                      disabled={!item}
                      onChange={(e) => update(idx, { lotId: Number(e.target.value) || null, lotChosen: true })}
                    >
                      <option value="">{item ? "Choose a lot…" : "Choose an item first"}</option>
                      {lots.map((l) => (
                        <option key={l.id} value={l.id} disabled={l.available <= 0}>
                          {l.raw.label} · {formatQty(Math.max(0, l.available), item!.unit)} available · {l.raw.expDate ? `exp ${l.raw.expDate}` : `received ${l.raw.received}`} · {l.raw.location}
                          {suggested?.id === l.id ? " (suggested)" : ""}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={`Planned qty${item ? ` (${item.unit})` : ""}`} htmlFor={`line_${idx}_qty`} error={err("qty")}>
                    <input id={`line_${idx}_qty`} name={`line_${idx}_qty`} inputMode="numeric" className={inputClass} value={line.qty} onChange={(e) => update(idx, { qty: e.target.value })} />
                  </Field>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : [blank()]))}
                      className="px-2 py-2 text-sm text-slate-500 hover:text-red-700"
                      aria-label={`Remove line ${idx + 1}`}
                    >
                      Remove
                    </button>
                  </div>
                </div>
                {lot && qty !== null && qty > lot.available && (
                  <p className="mt-2 text-sm text-red-700">
                    Only {formatQty(Math.max(0, lot.available), item!.unit)} available in this lot — plan less here and add another line for the rest.
                  </p>
                )}
                {other && (
                  <div role="alert" className="mt-3 space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                    <p>
                      <strong>Warning:</strong> {item!.code} is dedicated to <strong>{item!.dedicatedProduct}</strong>, not {product.trim()}.
                    </p>
                    <Field label="Reason for using it for this product" htmlFor={`line_${idx}_reason`} required error={err("reason")} hint="Saved in the audit trail.">
                      <input id={`line_${idx}_reason`} name={`line_${idx}_reason`} className={inputClass} value={line.reason} onChange={(e) => update(idx, { reason: e.target.value })} />
                    </Field>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        <button type="button" onClick={() => setLines((prev) => [...prev, blank()])} className={`${secondaryButtonClass} mt-3`}>
          + Add line
        </button>
      </fieldset>

      <Field label="Notes" htmlFor="notes" hint="Optional — shown on the pick list.">
        <input id="notes" name="notes" className={inputClass} />
      </Field>

      <FormMessage state={state.error ? state : {}} />
      <div className="flex flex-wrap items-center gap-3">
        <button className={buttonClass} disabled={pending}>
          {pending ? "Saving…" : "Create material issue"}
        </button>
        <span className="text-sm text-slate-500">Stock is reserved now and moves when you confirm after production.</span>
      </div>
    </form>
  );
}
