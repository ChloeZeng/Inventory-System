"use client";

import { startTransition, useActionState, useState } from "react";
import type { ActionState } from "@/lib/forms";
import { Field, FormMessage, buttonClass, inputClass } from "@/components/ui";
import { useCloseOnSuccess } from "@/components/detail/shell";

// Usage entry (spec §4.5): type → qty → room → product/customer → date → notes,
// showing the new balance and the cost of the quantity used.
export function UsageForm({
  action,
  balance,
  unitCost,
  types,
  rooms,
  today,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  balance: number;
  unitCost: number | null;
  types: { value: string; label: string }[];
  rooms: { id: number; name: string }[];
  today: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  useCloseOnSuccess(state);
  const fe = state.fieldErrors ?? {};
  // one id per opened form: resubmitting the same form cannot record it twice
  const [requestId] = useState(() => crypto.randomUUID());
  const [qty, setQty] = useState("");
  const n = /^\d+$/.test(qty.trim()) ? Number(qty.trim()) : null;

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
      <Field label="Used for" htmlFor="usageType" required error={fe.type}>
        <select id="usageType" name="type" className={inputClass} defaultValue="" autoFocus>
          <option value="" disabled>
            Choose…
          </option>
          {types.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Quantity (units)" htmlFor="usageQty" required error={fe.qty} hint={`${balance.toLocaleString()} units on hand`}>
        <input id="usageQty" name="qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} className={inputClass} />
      </Field>
      {n !== null && n > 0 && (
        <p className={`text-sm ${n > balance ? "text-red-700" : "text-slate-700"}`}>
          New balance: {(balance - n).toLocaleString()} units
          {unitCost !== null && ` · cost of quantity used: ${(n * unitCost).toLocaleString("en-US", { style: "currency", currency: "USD" })}`}
          {n > balance && " — more than is on hand"}
        </p>
      )}
      {rooms.length > 0 && (
        <Field label="Room" htmlFor="usageRoom" error={fe.roomId}>
          <select id="usageRoom" name="roomId" className={inputClass} defaultValue="">
            <option value="">—</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Product / customer / reference" htmlFor="usageRef" required error={fe.productOrCustomer}>
        <input id="usageRef" name="productOrCustomer" className={inputClass} />
      </Field>
      <Field label="Date used" htmlFor="usageDate" required error={fe.date}>
        <input id="usageDate" name="date" type="date" defaultValue={today} max={today} className={inputClass} />
      </Field>
      <Field label="Notes" htmlFor="usageNotes">
        <input id="usageNotes" name="notes" className={inputClass} />
      </Field>
      <FormMessage state={state.error ? state : {}} />
      <button className={buttonClass} disabled={pending}>
        {pending ? "Recording…" : "Record usage"}
      </button>
    </form>
  );
}
