"use client";

import { startTransition, useActionState } from "react";
import type { SpecField } from "@/lib/category-config";
import type { ActionState } from "@/lib/forms";
import { Field, FormMessage, buttonClass, inputClass } from "@/components/ui";
import { DescriptionFields, ItemExtrasFields } from "./item-fields";
import { useCloseOnSuccess } from "@/components/detail/shell";

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  specFields: SpecField[];
  suppliers: { id: number; name: string }[];
  categoryId?: number; // create mode
  subType?: string; // create mode, categories with sub-types (e.g. Silica: canister / packet)
  initial?: {
    name: string;
    legacyCode: string | null;
    specs: Record<string, string>;
    active: boolean;
    owner: string;
    dedicatedProduct: string | null;
    supplierId: number | null;
  }; // edit mode
};

export function ItemForm({ action, specFields, suppliers, categoryId, subType, initial }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  useCloseOnSuccess(state); // in a modal (item page "Edit"): close it and show the result
  const isEdit = !!initial;
  const fe = state.fieldErrors ?? {};

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        // manual dispatch: a refused save keeps what was typed
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      {categoryId && <input type="hidden" name="categoryId" value={categoryId} />}
      {subType && <input type="hidden" name="subType" value={subType} />}

      <DescriptionFields specFields={specFields} values={initial?.specs} errors={fe} />

      <Field
        label="Item name"
        htmlFor="name"
        required={isEdit}
        hint={isEdit ? undefined : "Leave blank to build it from the description above."}
        error={fe.name}
      >
        <input id="name" name="name" className={inputClass} defaultValue={initial?.name ?? ""} />
      </Field>

      <ItemExtrasFields suppliers={suppliers} initial={initial} errors={fe} />

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
