"use client";

import { startTransition, useActionState, useState } from "react";
import type { ActionState } from "@/lib/forms";
import { formatQty } from "@/lib/category-config";
import { Field, FormMessage, buttonClass, inputClass } from "@/components/ui";
import { useCloseOnSuccess } from "@/components/detail/shell";

// Loss, scrap or count adjustment (each needs a reason, saved in the audit trail).
// A monthly count is a count adjustment: the difference found, or 0 when the count matches.
export function StockChangeForm({
  action,
  balance,
  unit,
  today,
  initialType = "loss",
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  balance: number;
  unit: string;
  today: string;
  initialType?: "loss" | "scrap" | "count_adjustment";
}) {
  const [state, formAction, pending] = useActionState(action, {});
  useCloseOnSuccess(state);
  const fe = state.fieldErrors ?? {};
  const [requestId] = useState(() => crypto.randomUUID());
  const [type, setType] = useState(initialType);
  const [qty, setQty] = useState("");
  const count = type === "count_adjustment";
  const raw = qty.replace(/,/g, "").trim();
  const n = count ? (/^[+-]?\d+$/.test(raw) ? Number(raw) : null) : /^\d+$/.test(raw) ? -Number(raw) : null;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      <input type="hidden" name="clientRequestId" value={requestId} />
      <Field label="What happened?" htmlFor="stockType" required error={fe.type}>
        <select id="stockType" name="type" className={inputClass} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="loss">Loss (lost, damaged in storage, missing)</option>
          <option value="scrap">Scrap (thrown away)</option>
          <option value="count_adjustment">Count (monthly count / recount)</option>
        </select>
      </Field>
      <Field
        label={count ? `Difference found (${unit})` : `Quantity (${unit})`}
        htmlFor="stockQty"
        required
        error={fe.qty}
        hint={count ? `Counted minus ${formatQty(balance, unit)} on record, e.g. -12 or +5. Enter 0 if the count matches.` : `${formatQty(balance, unit)} on hand`}
      >
        <input id="stockQty" name="qty" inputMode={count ? "text" : "numeric"} value={qty} onChange={(e) => setQty(e.target.value)} className={inputClass} autoFocus />
      </Field>
      {n !== null && (
        <p className={`text-sm ${balance + n < 0 ? "text-red-700" : "text-slate-700"}`}>
          New balance: {formatQty(balance + n, unit)}
          {balance + n < 0 && " — more than is on hand"}
        </p>
      )}
      <Field label="Reason" htmlFor="stockReason" required error={fe.reason} hint="Saved on the record and in the audit trail.">
        <input id="stockReason" name="reason" className={inputClass} defaultValue={initialType === "count_adjustment" ? "Monthly stock count" : ""} />
      </Field>
      <Field label="Date" htmlFor="stockDate">
        <input id="stockDate" name="date" type="date" defaultValue={today} max={today} className={inputClass} />
      </Field>
      <Field label="Notes" htmlFor="stockNotes">
        <input id="stockNotes" name="notes" className={inputClass} />
      </Field>
      <FormMessage state={state.error ? state : {}} />
      <button className={buttonClass} disabled={pending}>
        {pending ? "Saving…" : count ? "Record count" : `Record ${type}`}
      </button>
    </form>
  );
}
