"use client";

import { startTransition, useActionState } from "react";
import type { ActionState } from "@/lib/forms";
import { Field, FormMessage, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

// Spec §4.4: status changes are confirmed (demo stand-in for re-entering a password)
// and dispatched manually so a refused change keeps what was typed.
function submitWithConfirm(message: string, dispatch: (fd: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (!window.confirm(message)) return;
    startTransition(() => dispatch(fd));
  };
}

export function ReleaseForm({ action, lotLabel, ready }: { action: Action; lotLabel: string; ready: boolean }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form onSubmit={submitWithConfirm(`Release lot ${lotLabel}? It can then be used in production.`, formAction)} className="space-y-3">
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="releaseStickerPlaced" className="mt-0.5 h-4 w-4" disabled={!ready} />
        <span>The RELEASE sticker is placed over the quarantine sticker on every box.</span>
      </label>
      <Field label="Comment" htmlFor="releaseComment" hint="Optional. Saved in the audit trail.">
        <input id="releaseComment" name="comment" className={inputClass} disabled={!ready} />
      </Field>
      <FormMessage state={state} />
      <button className={buttonClass} disabled={!ready || pending}>
        {pending ? "Releasing…" : "Release lot"}
      </button>
      {!ready && <p className="text-xs text-slate-500">Resolve the open requirements above first.</p>}
    </form>
  );
}

export function RejectForm({ action, lotLabel }: { action: Action; lotLabel: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form onSubmit={submitWithConfirm(`Reject lot ${lotLabel}? It can never be used.`, formAction)} className="space-y-3">
      <Field label="Reason for rejecting" htmlFor="rejectReason" required error={state.fieldErrors?.reason} hint="Saved in the audit trail.">
        <input id="rejectReason" name="reason" className={inputClass} />
      </Field>
      <FormMessage state={state} />
      <button className={`${secondaryButtonClass} border-red-300 text-red-700 hover:bg-red-50`} disabled={pending}>
        {pending ? "Rejecting…" : "Reject lot"}
      </button>
    </form>
  );
}
