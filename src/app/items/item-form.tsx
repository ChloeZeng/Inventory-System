"use client";

import { useActionState } from "react";
import type { SpecField } from "@/lib/category-config";
import type { ActionState } from "@/lib/forms";
import { Field, FormMessage, buttonClass, inputClass } from "@/components/ui";

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  specFields: SpecField[];
  categoryId?: number; // create mode
  initial?: { name: string; legacyCode: string | null; specs: Record<string, string>; active: boolean }; // edit mode
};

export function ItemForm({ action, specFields, categoryId, initial }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const isEdit = !!initial;
  const fe = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-4">
      {categoryId && <input type="hidden" name="categoryId" value={categoryId} />}

      {specFields.map((f) => (
        <Field key={f.key} label={f.label} htmlFor={`spec_${f.key}`} required={f.required} error={fe[`spec_${f.key}`]}>
          {f.type === "select" && f.options ? (
            <select id={`spec_${f.key}`} name={`spec_${f.key}`} className={inputClass} defaultValue={initial?.specs[f.key] ?? ""}>
              <option value="">—</option>
              {f.options.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          ) : (
            <input id={`spec_${f.key}`} name={`spec_${f.key}`} className={inputClass} defaultValue={initial?.specs[f.key] ?? ""} />
          )}
        </Field>
      ))}

      <Field
        label="Item name"
        htmlFor="name"
        required={isEdit}
        hint={isEdit ? undefined : "Leave blank to build it from the specs above."}
        error={fe.name}
      >
        <input id="name" name="name" className={inputClass} defaultValue={initial?.name ?? ""} />
      </Field>

      <Field label="Code in old spreadsheet" htmlFor="legacyCode" hint="Optional, e.g. C-Lids-010-38mm">
        <input id="legacyCode" name="legacyCode" className={inputClass} defaultValue={initial?.legacyCode ?? ""} />
      </Field>

      {!isEdit && (
        <Field label="Spec sheet" htmlFor="specSheet" hint="Optional now — required before any lot can be released.">
          <input id="specSheet" name="specSheet" type="file" className="text-sm" />
        </Field>
      )}

      {isEdit && (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={initial.active} /> Active (shown when receiving)
          </label>
          <Field label="Reason for change" htmlFor="reason" hint="Saved in the audit trail.">
            <input id="reason" name="reason" className={inputClass} />
          </Field>
        </>
      )}

      <FormMessage state={state} />
      <button className={buttonClass} disabled={pending}>
        {pending ? "Saving…" : isEdit ? "Save changes" : "Create item"}
      </button>
    </form>
  );
}
