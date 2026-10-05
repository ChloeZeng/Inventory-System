"use client";

import { startTransition, useActionState } from "react";
import type { ActionState } from "@/lib/forms";
import { Field, FormMessage, buttonClass, inputClass } from "@/components/ui";

// QC sign-off on a follow-up, e.g. a total that does not match the packing list / PO.
export function ResolveForm({ action, placeholder }: { action: (prev: ActionState, formData: FormData) => Promise<ActionState>; placeholder?: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        // Dispatch manually so a rejected save keeps what was typed.
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      <Field label="How was the difference resolved?" htmlFor="resolution" required error={state.fieldErrors?.resolution} hint="Saved in the audit trail with your name.">
        <textarea id="resolution" name="resolution" rows={2} className={inputClass} placeholder={placeholder} />
      </Field>
      <FormMessage state={state} />
      <button className={buttonClass} disabled={pending}>
        {pending ? "Saving…" : "Mark as resolved"}
      </button>
    </form>
  );
}
