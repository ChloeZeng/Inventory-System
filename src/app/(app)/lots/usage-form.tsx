"use client";

import { startTransition, useActionState, useState } from "react";
import type { ActionState } from "@/lib/forms";
import { formatQty } from "@/lib/category-config";
import { differsFromDedicated } from "@/lib/item-fields";
import { Field, FormMessage, buttonClass, inputClass } from "@/components/ui";
import { useCloseOnSuccess } from "@/components/detail/shell";

// Usage entry (spec §4.5): type → qty → room → product/customer → date → notes,
// showing the new balance and the cost of the quantity used. For production use of an
// item reserved for one product, another product shows a warning and needs a reason
// (recordUsage enforces the same rule and logs the reason in the audit trail).
export function UsageForm({
  action,
  balance,
  unit = "units",
  unitCost,
  types,
  rooms,
  today,
  dedicatedProduct = null,
  products = [],
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  balance: number;
  unitCost: number | null;
  types: { value: string; label: string }[];
  rooms: { id: number; name: string }[];
  today: string;
  unit?: string;
  dedicatedProduct?: string | null;
  products?: string[]; // suggestions: products used before
}) {
  const [state, formAction, pending] = useActionState(action, {});
  useCloseOnSuccess(state);
  const fe = state.fieldErrors ?? {};
  // one id per opened form: resubmitting the same form cannot record it twice
  const [requestId] = useState(() => crypto.randomUUID());
  const [qty, setQty] = useState("");
  const n = /^\d+$/.test(qty.trim()) ? Number(qty.trim()) : null;
  const [type, setType] = useState("");
  const production = type === "production_use";
  const [product, setProduct] = useState<string | null>(null); // null: not typed yet
  // production use starts from the dedicated product; other uses name a customer or reference
  const productValue = product ?? (production && dedicatedProduct ? dedicatedProduct : "");
  const otherProduct = production && differsFromDedicated(dedicatedProduct, productValue);

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
        <select id="usageType" name="type" className={inputClass} value={type} onChange={(e) => setType(e.target.value)} autoFocus>
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
      <Field label={`Quantity (${unit})`} htmlFor="usageQty" required error={fe.qty} hint={`${formatQty(balance, unit)} on hand`}>
        <input id="usageQty" name="qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} className={inputClass} />
      </Field>
      {n !== null && n > 0 && (
        <p className={`text-sm ${n > balance ? "text-red-700" : "text-slate-700"}`}>
          New balance: {formatQty(balance - n, unit)}
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
      <Field
        label={production ? "Product" : "Product / customer / reference"}
        htmlFor="usageRef"
        required
        error={fe.productOrCustomer}
        hint={dedicatedProduct ? `This item is dedicated to ${dedicatedProduct}.` : undefined}
      >
        <input
          id="usageRef"
          name="productOrCustomer"
          list="usage-products"
          className={inputClass}
          value={productValue}
          onChange={(e) => setProduct(e.target.value)}
        />
        <datalist id="usage-products">
          {[...new Set([dedicatedProduct, ...products].filter((p): p is string => !!p))].map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </Field>
      {otherProduct && (
        <div role="alert" className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p>
            <strong>Warning:</strong> this item is dedicated to <strong>{dedicatedProduct}</strong>, not {productValue.trim()}.
          </p>
          <Field label="Reason for using it for another product" htmlFor="usageProductReason" required error={fe.productReason} hint="Saved in the audit trail.">
            <input id="usageProductReason" name="productReason" className={inputClass} />
          </Field>
        </div>
      )}
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
