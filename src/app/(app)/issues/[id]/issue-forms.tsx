"use client";

import { startTransition, useActionState, useState } from "react";
import type { ActionState } from "@/lib/forms";
import { formatQty } from "@/lib/category-config";
import { Field, FormMessage, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;
export type ConfirmLineView = { id: number; label: string; lot: string; planned: number; unit: string };

const whole = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : null);

// After production: actual quantity used, loss and quantity returned, per line. They normally
// add up to the planned (picked) quantity; if not, a note says why.
export function ConfirmIssueForm({ action, lines }: { action: Action; lines: ConfirmLineView[] }) {
  const [state, formAction, pending] = useActionState(action, {});
  const fe = state.fieldErrors ?? {};
  const [values, setValues] = useState(() => Object.fromEntries(lines.map((l) => [l.id, { actual: String(l.planned), loss: "0", returned: "0" }])));
  const set = (id: number, k: "actual" | "loss" | "returned", v: string) => setValues((p) => ({ ...p, [id]: { ...p[id], [k]: v } }));
  const off = lines.filter((l) => {
    const v = values[l.id];
    const [a, lo, r] = [whole(v.actual), whole(v.loss || "0"), whole(v.returned || "0")];
    return a !== null && lo !== null && r !== null && a + lo + r !== l.planned;
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        if (!window.confirm("Confirm the quantities? Lot balances are updated and this cannot be edited afterwards.")) return;
        startTransition(() => formAction(fd));
      }}
      className="space-y-4"
    >
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Item · lot</th>
              <th className="px-3 py-2 text-right font-medium">Planned</th>
              <th className="px-3 py-2 font-medium">Actual used</th>
              <th className="px-3 py-2 font-medium">Loss</th>
              <th className="px-3 py-2 font-medium">Returned</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((l, i) => (
              <tr key={l.id} className={off.includes(l) ? "bg-amber-50" : ""}>
                <td className="px-3 py-2">
                  {l.label}
                  <div className="font-mono text-xs text-slate-500">{l.lot}</div>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatQty(l.planned, l.unit)}</td>
                {(["actual", "loss", "returned"] as const).map((k) => (
                  <td key={k} className="px-3 py-2 align-top">
                    <input
                      name={`${k}_${l.id}`}
                      aria-label={`${k === "actual" ? "Actual used" : k === "loss" ? "Loss" : "Returned"} — ${l.label}`}
                      inputMode="numeric"
                      value={values[l.id][k]}
                      onChange={(e) => set(l.id, k, e.target.value)}
                      className={`${inputClass} w-28`}
                    />
                    {fe[`line_${i}_${k}`] && <p className="mt-1 text-xs text-red-700">{fe[`line_${i}_${k}`]}</p>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {off.length > 0 && (
        <Field
          label="Why do actual + loss + returned differ from the planned quantity?"
          htmlFor="confirmNote"
          required
          error={fe.confirmNote}
          hint={`${off.length === 1 ? "1 line differs" : `${off.length} lines differ`} (highlighted). Saved in the audit trail.`}
        >
          <input id="confirmNote" name="confirmNote" className={inputClass} />
        </Field>
      )}
      <FormMessage state={state.error ? state : {}} />
      <button className={buttonClass} disabled={pending}>
        {pending ? "Confirming…" : "Confirm after production"}
      </button>
    </form>
  );
}

export function CancelIssueForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
      className="space-y-3"
    >
      <Field label="Reason for cancelling" htmlFor="cancelReason" required error={state.fieldErrors?.reason} hint="Nothing has been taken from stock yet; the reservation is released.">
        <input id="cancelReason" name="reason" className={inputClass} />
      </Field>
      <FormMessage state={state.error ? state : {}} />
      <button className={`${secondaryButtonClass} border-red-300 text-red-700 hover:bg-red-50`} disabled={pending}>
        Cancel material issue
      </button>
    </form>
  );
}
