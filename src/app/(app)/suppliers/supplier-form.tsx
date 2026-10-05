"use client";

import { useActionState } from "react";
import { QC_AUTH_REQUIRED, SUPPLIER_TYPES } from "@/lib/constants";
import type { ActionState } from "@/lib/forms";
import { Field, FormMessage, buttonClass, inputClass } from "@/components/ui";

type Initial = {
  name: string;
  type: string;
  aslApproved: boolean;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  active: boolean;
};

export function SupplierForm({
  action,
  initial,
  canApprove,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial?: Initial;
  canApprove: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const fe = state.fieldErrors ?? {};
  const isEdit = !!initial;

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Supplier name" htmlFor="name" required error={fe.name}>
        <input id="name" name="name" className={inputClass} defaultValue={initial?.name} />
      </Field>

      <Field label="Type" htmlFor="type" required error={fe.type}>
        <select id="type" name="type" className={inputClass} defaultValue={initial?.type ?? "svlsg"}>
          {SUPPLIER_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>

      <div id="field-aslApproved">
        <Field
          label="Approved Supplier List (ASL, F.QC.010)"
          error={fe.aslApproved}
          hint={canApprove ? "Receiving from a supplier that is not approved shows a warning." : `${QC_AUTH_REQUIRED} to change this.`}
        >
          <label className="flex items-center gap-2 text-sm">
            {/* Disabled checkboxes are not submitted, so mirror the current value in a hidden field. */}
            {!canApprove && initial?.aslApproved && <input type="hidden" name="aslApproved" value="on" />}
            <input type="checkbox" name="aslApproved" defaultChecked={initial?.aslApproved ?? false} disabled={!canApprove} />
            ASL approved
          </label>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Contact name" htmlFor="contactName">
          <input id="contactName" name="contactName" className={inputClass} defaultValue={initial?.contactName ?? ""} />
        </Field>
        <Field label="Email" htmlFor="email">
          <input id="email" name="email" type="email" className={inputClass} defaultValue={initial?.email ?? ""} />
        </Field>
        <Field label="Phone" htmlFor="phone">
          <input id="phone" name="phone" className={inputClass} defaultValue={initial?.phone ?? ""} />
        </Field>
      </div>

      <Field label="Notes" htmlFor="notes">
        <textarea id="notes" name="notes" rows={3} className={inputClass} defaultValue={initial?.notes ?? ""} />
      </Field>

      {isEdit && (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={initial.active} /> Active (shown when receiving)
          </label>
          <Field label="Reason for change" htmlFor="reason" error={fe.reason} hint="Required when changing ASL approval. Saved in the audit trail.">
            <input id="reason" name="reason" className={inputClass} />
          </Field>
        </>
      )}

      <FormMessage state={state} />
      <button className={buttonClass} disabled={pending}>
        {pending ? "Saving…" : isEdit ? "Save changes" : "Create supplier"}
      </button>
    </form>
  );
}
