"use client";

import { startTransition, useActionState } from "react";
import type { ActionState } from "@/lib/forms";
import { FormMessage, inputClass, secondaryButtonClass } from "@/components/ui";

export function QcAuthorizationForm({
  action,
  userName,
  qcAuthorized,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  userName: string;
  qcAuthorized: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      <input type="hidden" name="qcAuthorized" value={qcAuthorized ? "no" : "yes"} />
      <div className="flex flex-wrap items-center gap-2">
        <input
          name="reason"
          aria-label={`Reason for ${qcAuthorized ? "removing" : "granting"} QC authorization for ${userName}`}
          placeholder="Reason (required)"
          className={`${inputClass} max-w-64`}
        />
        <button className={secondaryButtonClass} disabled={pending}>
          {pending ? "Saving…" : qcAuthorized ? "Remove QC authorization" : "Grant QC authorization"}
        </button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
