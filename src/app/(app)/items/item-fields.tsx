"use client";

import { useState } from "react";
import type { SpecField } from "@/lib/category-config";
import { Field, inputClass } from "@/components/ui";

// Description (size, material, color…) — the category's spec fields.
// Uncontrolled unless `onChange` is given (the receiving wizard keeps them in its state).
export function DescriptionFields({
  specFields,
  values,
  errors,
  onChange,
}: {
  specFields: SpecField[];
  values?: Record<string, string>;
  errors: Record<string, string | undefined>;
  onChange?: (key: string, value: string) => void;
}) {
  if (!specFields.length) return null;
  return (
    <fieldset className="@container">
      <legend className="mb-2 text-sm font-semibold text-slate-800">Description</legend>
      <div className="grid gap-4 @md:grid-cols-3">
        {specFields.map((f) => {
          const id = `spec_${f.key}`;
          const bind = onChange
            ? { value: values?.[f.key] ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange(f.key, e.target.value) }
            : { defaultValue: values?.[f.key] ?? "" };
          return (
            <Field key={f.key} label={f.label} htmlFor={id} required={f.required} error={errors[id]}>
              {f.type === "select" && f.options ? (
                <select id={id} name={id} className={inputClass} {...bind}>
                  <option value="">—</option>
                  {f.options.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input id={id} name={id} className={inputClass} {...bind} />
              )}
            </Field>
          );
        })}
      </div>
    </fieldset>
  );
}

export type ExtrasValue = { ownerKind: "svlsg" | "client"; ownerClient: string; dedicatedProduct: string; supplierId: number | null };

export function extrasFromItem(initial?: { owner: string; dedicatedProduct: string | null; supplierId: number | null }): ExtrasValue {
  const client = !!initial && initial.owner.trim().toUpperCase() !== "SVLSG";
  return {
    ownerKind: client ? "client" : "svlsg",
    ownerClient: client ? initial!.owner : "",
    dedicatedProduct: initial?.dedicatedProduct ?? "",
    supplierId: initial?.supplierId ?? null,
  };
}

// Owner (SVLSG or a client), dedicated product and usual supplier. Owner and supplier are
// separate questions: a client can own stock that another company supplied.
// `supplierChoice: false` hides the supplier (the wizard takes it from the delivery).
export function ItemExtrasFields({
  suppliers,
  initial,
  errors,
  value: controlled,
  onChange,
  supplierChoice = true,
}: {
  suppliers: { id: number; name: string }[];
  initial?: { owner: string; dedicatedProduct: string | null; supplierId: number | null };
  errors: Record<string, string | undefined>;
  value?: ExtrasValue;
  onChange?: (v: ExtrasValue) => void;
  supplierChoice?: boolean;
}) {
  const [own, setOwn] = useState<ExtrasValue>(() => controlled ?? extrasFromItem(initial));
  const v = controlled ?? own;
  const set = (patch: Partial<ExtrasValue>) => {
    const next = { ...v, ...patch };
    setOwn(next);
    onChange?.(next);
  };

  return (
    <div className="space-y-4 @container">
      <Field label="Owner" required error={errors.ownerClient} hint="Who owns this stock. Not the same as the supplier.">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="ownerKind" value="svlsg" checked={v.ownerKind === "svlsg"} onChange={() => set({ ownerKind: "svlsg" })} />
            SVLSG
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="ownerKind" value="client" checked={v.ownerKind === "client"} onChange={() => set({ ownerKind: "client" })} />
            A client
          </label>
          {v.ownerKind === "client" && (
            <input
              name="ownerClient"
              aria-label="Client name"
              placeholder="Client name, e.g. LiQi"
              className={`${inputClass} max-w-xs`}
              value={v.ownerClient}
              onChange={(e) => set({ ownerClient: e.target.value })}
            />
          )}
        </div>
      </Field>
      <div className="grid gap-4 @md:grid-cols-2">
        <Field
          label="Dedicated product"
          htmlFor="dedicatedProduct"
          hint="Optional. Using it for another product will ask for a reason."
          error={errors.dedicatedProduct}
        >
          <input
            id="dedicatedProduct"
            name="dedicatedProduct"
            className={inputClass}
            placeholder="e.g. EGUOO-Milk Thistle"
            value={v.dedicatedProduct}
            onChange={(e) => set({ dedicatedProduct: e.target.value })}
          />
        </Field>
        {supplierChoice && (
          <Field label="Usual supplier" htmlFor="itemSupplierId" hint="Optional. Each delivery still records who delivered it." error={errors.itemSupplierId}>
            <select
              id="itemSupplierId"
              name="itemSupplierId"
              className={inputClass}
              value={v.supplierId ?? ""}
              onChange={(e) => set({ supplierId: Number(e.target.value) || null })}
            >
              <option value="">—</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
    </div>
  );
}
