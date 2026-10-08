"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import type { ActionState } from "@/lib/forms";
import { Field, FormMessage, buttonClass, inputClass } from "@/components/ui";
import { useCloseOnSuccess } from "./shell";
import type { FixSpec } from "./types";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

// The body of a "Fix" modal: only the field(s) or upload for one requirement.
// Saves through the record's normal (audited) actions; on success the modal closes
// and the page refreshes its data in place.
export function FixForm({
  spec,
  save,
  upload,
  resolve,
}: {
  spec: FixSpec;
  save?: Action; // field changes (sends `_fields` so only these fields are saved)
  upload?: Action; // document upload for the target record
  resolve?: React.ReactNode; // QC sign-off form (already wrapped in its QC gate)
}) {
  switch (spec.kind) {
    case "fields":
    case "confirm":
    case "answer":
      return save ? <FieldsForm spec={spec} action={save} /> : null;
    case "upload":
      return upload ? <UploadOne spec={spec} action={upload} /> : null;
    case "resolve":
      return (
        <div className="space-y-3 text-sm">
          <p className="font-medium">{spec.question}</p>
          {spec.note && (
            <p>
              <span className="text-slate-500">Recorded at receiving:</span> {spec.note}
            </p>
          )}
          {resolve}
          {spec.correction && save && (
            <details className="rounded-md border border-slate-200 px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">Correct the recorded answer instead</summary>
              <div className="mt-3">
                <FieldsForm spec={spec.correction} action={save} />
              </div>
            </details>
          )}
        </div>
      );
    case "link":
      return (
        <div className="space-y-4 text-sm">
          <p>{spec.message}</p>
          <Link href={spec.href} className={buttonClass}>
            {spec.label}
          </Link>
        </div>
      );
    case "tab":
      return null;
  }
}

function useDispatch(action: Action) {
  const [state, formAction, pending] = useActionState(action, {});
  useCloseOnSuccess(state);
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    // manual dispatch: a refused save keeps what was typed
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => formAction(fd));
  };
  return { state, pending, onSubmit };
}

// Is a value already recorded for this requirement? Changing a recorded value is a
// correction, and updateLotDetails then requires a reason (filling a blank one does not).
function hasRecordedValue(spec: Extract<FixSpec, { kind: "fields" | "confirm" | "answer" }>) {
  if (spec.kind === "fields") return spec.correcting;
  if (spec.kind === "answer") return spec.value !== "";
  return false; // confirm: ticking a box that was not ticked is not a correction
}

function FieldsForm({ spec, action }: { spec: Extract<FixSpec, { kind: "fields" | "confirm" | "answer" }>; action: Action }) {
  const { state, pending, onSubmit } = useDispatch(action);
  const fe = state.fieldErrors ?? {};
  // The reason input is shown up front for corrections, and in any case as soon as the
  // server asks for one — it then stays, so the user can answer within the modal.
  const [askReason, setAskReason] = useState(() => hasRecordedValue(spec));
  if (fe.reason && !askReason) setAskReason(true);
  const [answer, setAnswer] = useState(spec.kind === "answer" ? spec.value : "");

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {spec.kind === "fields" &&
        spec.inputs.map((i, n) => (
          <Field key={i.field} label={i.label} htmlFor={`fix-${i.field}`} hint={i.hint} error={fe[i.field]}>
            <input type="hidden" name="_fields" value={i.field} />
            {i.input === "select" ? (
              <select id={`fix-${i.field}`} name={i.field} defaultValue={i.value} className={inputClass} autoFocus={n === 0}>
                <option value="">—</option>
                {i.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={`fix-${i.field}`}
                name={i.field}
                type={i.input === "date" ? "date" : "text"}
                inputMode={i.input === "decimal" ? "decimal" : undefined}
                defaultValue={i.value}
                className={inputClass}
                autoFocus={n === 0}
              />
            )}
          </Field>
        ))}

      {spec.kind === "confirm" && (
        <label className="flex items-start gap-3 rounded-md border border-slate-300 p-3 text-sm">
          <input type="hidden" name="_fields" value={spec.field} />
          <input type="checkbox" name={spec.field} required className="mt-0.5 h-5 w-5" autoFocus />
          <span>{spec.statement}</span>
        </label>
      )}

      {spec.kind === "answer" && (
        <>
          <input type="hidden" name="_fields" value={spec.field} />
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-700">{spec.question}</legend>
            <div className="flex gap-4 text-sm">
              {(["yes", "no"] as const).map((v) => (
                <label key={v} className="flex items-center gap-2">
                  <input type="radio" name={spec.field} value={v} checked={answer === v} onChange={() => setAnswer(v)} required />
                  {v === "yes" ? "Yes" : "No"}
                </label>
              ))}
            </div>
          </fieldset>
          {answer === "no" ? (
            <Field label="What is different?" htmlFor="fix-note" hint="Shortages and overages go here." error={fe[spec.noteField]}>
              {/* the note is sent (and may change) only with a "No" answer */}
              <input type="hidden" name="_fields" value={spec.noteField} />
              <textarea id="fix-note" name={spec.noteField} rows={2} defaultValue={spec.note} className={inputClass} />
            </Field>
          ) : (
            spec.note && (
              <p className="text-xs text-slate-500">
                The saved packing list note stays on record: “{spec.note}”.
              </p>
            )
          )}
        </>
      )}

      {askReason && (
        <Field
          label="Reason for change"
          htmlFor="fix-reason"
          required
          error={fe.reason}
          hint="A value is already recorded, so the change needs a reason. Saved in the audit trail."
        >
          <input id="fix-reason" name="reason" className={inputClass} autoFocus={!!fe.reason} />
        </Field>
      )}

      <FormMessage state={state.error ? state : {}} />
      <button className={buttonClass} disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

function UploadOne({ spec, action }: { spec: Extract<FixSpec, { kind: "upload" }>; action: Action }) {
  const { state, pending, onSubmit } = useDispatch(action);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {spec.types.length > 1 ? (
        <Field label="Document type" htmlFor="fix-type">
          <select id="fix-type" name="type" className={inputClass} defaultValue={spec.types[0]}>
            {spec.types.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
      ) : (
        <input type="hidden" name="type" value={spec.types[0]} />
      )}
      <Field label="File" htmlFor="fix-file" hint={spec.note}>
        <input id="fix-file" name="file" type="file" required className="text-sm" />
      </Field>
      <FormMessage state={state.error ? state : {}} />
      <button className={buttonClass} disabled={pending}>
        {pending ? "Uploading…" : "Upload"}
      </button>
    </form>
  );
}
