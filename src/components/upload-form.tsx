"use client";

import { useActionState, useRef, useEffect } from "react";
import type { ActionState } from "@/lib/forms";
import { FormMessage, inputClass, secondaryButtonClass } from "@/components/ui";

export function UploadForm({
  action,
  types,
  defaultType,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  types: readonly string[];
  defaultType: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select name="type" defaultValue={defaultType} className={`${inputClass} w-auto`}>
          {types.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <input name="file" type="file" className="text-sm" required />
        <button className={secondaryButtonClass} disabled={pending}>
          {pending ? "Uploading…" : "Upload"}
        </button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
