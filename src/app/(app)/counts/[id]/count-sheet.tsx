"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import type { ActionState } from "@/lib/forms";
import type { SheetGroup } from "@/lib/stock-count-db";
import { formatQty } from "@/lib/category-config";
import { Field, FormMessage, buttonClass, inputClass } from "@/components/ui";
import { QcStatusBadge } from "@/components/qc-status-badge";

type Entry = { counted: string; reason: string };

// The count sheet: every lot with stock, by category and location. Enter what is on the
// shelf; a difference from the system quantity needs a reason. What is typed is kept in this
// browser until the count is submitted (counting can take a while).
export function CountSheet({ action, groups, today, draftKey }: { action: (p: ActionState, f: FormData) => Promise<ActionState>; groups: SheetGroup[]; today: string; draftKey: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  const fe = state.fieldErrors ?? {};
  const [entries, setEntries] = useState<Record<number, Entry>>({});
  const [location, setLocation] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(draftKey);
      // restoring the browser draft after hydration (the server cannot read it)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setEntries(JSON.parse(saved) as Record<number, Entry>);
    } catch {
      // no storage: start empty
    }
    setLoaded(true);
  }, [draftKey]);
  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(entries));
    } catch {
      // not saved locally; the count still works
    }
  }, [entries, draftKey, loaded]);

  const set = (lotId: number, patch: Partial<Entry>) => setEntries((p) => ({ ...p, [lotId]: { ...{ counted: "", reason: "" }, ...p[lotId], ...patch } }));
  const all = groups.flatMap((g) => g.lots);
  const diffOf = (lotId: number, system: number) => {
    const c = (entries[lotId]?.counted ?? "").replace(/,/g, "").trim();
    return /^\d+$/.test(c) ? Number(c) - system : null;
  };
  const counted = all.filter((l) => diffOf(l.lotId, l.systemQty) !== null).length;
  const differences = all.filter((l) => (diffOf(l.lotId, l.systemQty) ?? 0) !== 0).length;
  const locations = [...new Set(groups.map((g) => g.location))];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        if (!window.confirm(`Submit the count? ${differences === 1 ? "1 difference" : `${differences} differences`} will be booked as count adjustments.`)) return;
        startTransition(() => formAction(fd));
      }}
      className="space-y-6"
    >
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Count date" htmlFor="countDate" required error={fe.countDate}>
          <input id="countDate" name="countDate" type="date" defaultValue={today} max={today} className={`${inputClass} w-44`} />
        </Field>
        <label className="text-sm text-slate-600">
          <span className="mb-1 block text-xs text-slate-500">Show location</span>
          <select value={location} onChange={(e) => setLocation(e.target.value)} className={`${inputClass} w-auto`}>
            <option value="">All locations</option>
            {locations.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <p className="ml-auto text-sm text-slate-600" aria-live="polite">
          <strong className="tabular-nums">{counted}</strong> of {all.length} lots counted · <strong className="tabular-nums">{differences}</strong>{" "}
          {differences === 1 ? "difference" : "differences"}
        </p>
      </div>

      {groups.map((g) => (
        <section key={`${g.category}|${g.location}`} hidden={!!location && g.location !== location} aria-label={`${g.category} — ${g.location}`}>
          <h2 className="mb-2 text-base font-semibold">
            {g.category} <span className="font-normal text-slate-500">· {g.location}</span>
          </h2>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-medium">Item</th>
                  <th className="px-3 py-2 font-medium">Lot</th>
                  <th className="px-3 py-2 text-right font-medium">System qty</th>
                  <th className="px-3 py-2 font-medium">Counted</th>
                  <th className="px-3 py-2 text-right font-medium">Difference</th>
                  <th className="px-3 py-2 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {g.lots.map((l) => {
                  const diff = diffOf(l.lotId, l.systemQty);
                  const err = fe[`lot_${l.lotId}`];
                  return (
                    <tr key={l.lotId} className={err ? "bg-red-50" : diff ? "bg-amber-50/60" : ""}>
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs">{l.itemCode}</span> {l.itemName}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <span className="font-mono">{l.lot}</span> {l.status !== "Released" && <QcStatusBadge status={l.status} />}
                        {l.expDate && <span className="block text-xs text-slate-500">exp {l.expDate}</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatQty(l.systemQty, l.unit)}</td>
                      <td className="px-3 py-2">
                        <input type="hidden" name="lotId" value={l.lotId} />
                        <input type="hidden" name={`system_${l.lotId}`} value={l.systemQty} />
                        <input
                          name={`counted_${l.lotId}`}
                          aria-label={`Counted — ${l.itemCode} lot ${l.lot}`}
                          inputMode="numeric"
                          value={entries[l.lotId]?.counted ?? ""}
                          onChange={(e) => set(l.lotId, { counted: e.target.value })}
                          className={`${inputClass} w-28`}
                        />
                      </td>
                      <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${diff ? "font-semibold text-amber-900" : "text-slate-500"}`}>
                        {diff === null ? "—" : diff === 0 ? "0" : `${diff > 0 ? "+" : "−"}${formatQty(Math.abs(diff), l.unit)}`}
                      </td>
                      <td className="px-3 py-2">
                        {diff ? (
                          <input
                            name={`reason_${l.lotId}`}
                            aria-label={`Reason — ${l.itemCode} lot ${l.lot}`}
                            value={entries[l.lotId]?.reason ?? ""}
                            onChange={(e) => set(l.lotId, { reason: e.target.value })}
                            placeholder="Required"
                            className={`${inputClass} min-w-48`}
                          />
                        ) : null}
                        {err && <p className="mt-1 text-xs text-red-700">{err}</p>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <Field label="Notes" htmlFor="countNotes" hint="Optional — e.g. who counted which area.">
        <input id="countNotes" name="notes" className={inputClass} />
      </Field>
      <FormMessage state={state.error ? state : {}} />
      <div className="flex flex-wrap items-center gap-3">
        <button className={buttonClass} disabled={pending || counted < all.length}>
          {pending ? "Submitting…" : "Submit count"}
        </button>
        {counted < all.length && <span className="text-sm text-slate-500">Enter a counted quantity for every lot ({all.length - counted} left).</span>}
      </div>
    </form>
  );
}
