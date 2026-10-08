"use client";

import { startTransition, useActionState, useState } from "react";
import type { InspectionQuestion } from "@/lib/category-config";
import type { ActionState } from "@/lib/forms";
import type { ChecklistAnswer, DefectClass } from "@/lib/inspection";
import { DEFECT_CLASSES, calculatedDisposition, type ClassPlan } from "@/lib/sampling";
import { Field, FormMessage, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { QcAuthNote } from "@/components/qc-gate";
import { useCloseOnSuccess } from "@/components/detail/shell";

type Plan = { classes: ClassPlan[]; sampleSize: number; lotSize: number; hundredPercent: boolean } | null;

export type InspectionDraft = {
  casesSampled: number | null;
  itemsSampled: number | null;
  checklist: Record<string, ChecklistAnswer>;
  defects: Record<DefectClass, number>;
  defectNotes: string | null;
  comments: string | null;
  savedBy: string;
  savedAt: string;
};

// F.WD.003 entry. "Save draft" keeps the results without completing anything;
// "Confirm inspection" (QC-authorized) records the final disposition.
export function InspectionForm({
  action,
  questions,
  plan,
  draft,
  qcAuthorized,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  questions: InspectionQuestion[];
  plan: Plan;
  draft: InspectionDraft | null;
  qcAuthorized: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  useCloseOnSuccess(state);
  const fe = state.fieldErrors ?? {};

  const [answers, setAnswers] = useState<Record<string, ChecklistAnswer>>(draft?.checklist ?? {});
  const [defects, setDefects] = useState<Record<DefectClass, string>>({
    critical: draft ? String(draft.defects.critical) : "",
    major: draft ? String(draft.defects.major) : "",
    minor: draft ? String(draft.defects.minor) : "",
  });
  const toCount = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : undefined);
  const suggestion = plan
    ? calculatedDisposition(plan.classes, { critical: toCount(defects.critical), major: toCount(defects.major), minor: toCount(defects.minor) })
    : null;
  const [disposition, setDisposition] = useState<string>("");
  const effectiveDisposition = disposition || suggestion || "";
  const overriding = !!suggestion && !!effectiveDisposition && effectiveDisposition !== suggestion;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    if (fd.get("intent") === "confirm" && !window.confirm(`Confirm the inspection as ${effectiveDisposition || "…"}? It cannot be edited afterwards.`)) return;
    startTransition(() => formAction(fd));
  }

  const groups = Map.groupBy(questions, (q) => q.group ?? "Checklist");

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {draft && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Draft saved by {draft.savedBy} on {draft.savedAt}. It does not count until a QC-authorized user confirms it.
        </p>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="Cases sampled" htmlFor="casesSampled" error={fe.casesSampled}>
          <input id="casesSampled" name="casesSampled" inputMode="numeric" defaultValue={draft?.casesSampled ?? ""} className={inputClass} />
        </Field>
        <Field
          label="Items inspected"
          htmlFor="itemsSampled"
          required
          error={fe.itemsSampled}
          hint={plan ? `Sampling plan: ${plan.hundredPercent ? "all" : plan.sampleSize.toLocaleString()} of ${plan.lotSize.toLocaleString()} units` : undefined}
        >
          <input id="itemsSampled" name="itemsSampled" inputMode="numeric" defaultValue={draft?.itemsSampled ?? ""} className={inputClass} />
        </Field>
      </section>

      {questions.length > 0 ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Checklist</h3>
          <div className="space-y-4">
            {[...groups].map(([group, qs]) => (
              <fieldset key={group} className="rounded-md border border-slate-200">
                <legend className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{group}</legend>
                <ul className="divide-y divide-slate-100">
                  {qs.map((q) => {
                    const a = answers[q.key];
                    return (
                      <li key={q.key} className="flex flex-col gap-2 px-3 py-2 text-sm sm:flex-row sm:items-center">
                        <span className="flex-1">
                          {q.label}
                          {fe[`q_${q.key}`] && <span className="block text-xs text-red-600">{fe[`q_${q.key}`]}</span>}
                        </span>
                        <span className="flex items-center gap-3" role="radiogroup" aria-label={q.label}>
                          {(["yes", "no", "na"] as const).map((v) => (
                            <label key={v} className="flex items-center gap-1">
                              <input
                                type="radio"
                                name={`q_${q.key}`}
                                value={v}
                                checked={a?.answer === v}
                                onChange={() => setAnswers({ ...answers, [q.key]: { answer: v, defectClass: v === "no" ? a?.defectClass : undefined } })}
                              />
                              {v === "yes" ? "Yes" : v === "no" ? "No" : "N/A"}
                            </label>
                          ))}
                          {a?.answer === "no" && (
                            <select
                              name={`qc_${q.key}`}
                              aria-label={`Defect class for “${q.label}”`}
                              value={a.defectClass ?? ""}
                              onChange={(e) => setAnswers({ ...answers, [q.key]: { answer: "no", defectClass: (e.target.value || undefined) as DefectClass } })}
                              className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                            >
                              <option value="">Defect class…</option>
                              {DEFECT_CLASSES.map((d) => (
                                <option key={d.cls} value={d.cls}>
                                  {d.label}
                                </option>
                              ))}
                            </select>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            ))}
          </div>
        </section>
      ) : (
        <p className="text-sm text-slate-600">No inspection checklist is configured for this category.</p>
      )}

      <section>
        <h3 className="mb-2 text-sm font-semibold">Defects found</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          {DEFECT_CLASSES.map((d) => {
            const c = plan?.classes.find((x) => x.cls === d.cls);
            return (
              <Field
                key={d.cls}
                label={d.label}
                htmlFor={`defects_${d.cls}`}
                required
                error={fe[`defects_${d.cls}`]}
                hint={c ? `Plan: accept ≤ ${c.ac}, reject ≥ ${c.re} (AQL ${c.aql}, sample ${c.sampleSize.toLocaleString()})` : undefined}
              >
                <input
                  id={`defects_${d.cls}`}
                  name={`defects_${d.cls}`}
                  inputMode="numeric"
                  value={defects[d.cls]}
                  onChange={(e) => setDefects({ ...defects, [d.cls]: e.target.value })}
                  className={inputClass}
                />
              </Field>
            );
          })}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Defect notes" htmlFor="defectNotes">
            <textarea id="defectNotes" name="defectNotes" rows={2} defaultValue={draft?.defectNotes ?? ""} className={inputClass} />
          </Field>
          <Field label="Comments" htmlFor="comments">
            <textarea id="comments" name="comments" rows={2} defaultValue={draft?.comments ?? ""} className={inputClass} />
          </Field>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-sm font-semibold">Disposition</h3>
        <p className="mt-1 text-sm text-slate-700">
          {plan
            ? suggestion
              ? <>Calculated from the sampling plan: <strong>{suggestion}</strong>.</>
              : "Enter all three defect counts to see the result calculated from the sampling plan."
            : "No sampling plan is configured for this category — choose the disposition."}
        </p>
        {plan && <p className="mt-0.5 text-xs text-slate-500">The plan uses seeded ANSI Z1.4 tables that QA must verify; QC decides.</p>}

        {qcAuthorized ? (
          <div className="mt-3 space-y-3">
            <fieldset>
              <legend className="mb-1 text-sm font-medium text-slate-700">Final disposition</legend>
              <div className="flex gap-4 text-sm">
                {(["Approved", "Rejected"] as const).map((v) => (
                  <label key={v} className="flex items-center gap-2">
                    <input type="radio" name="disposition" value={v} checked={effectiveDisposition === v} onChange={() => setDisposition(v)} />
                    {v}
                  </label>
                ))}
              </div>
              {fe.disposition && <p className="text-xs text-red-600">{fe.disposition}</p>}
            </fieldset>
            {(overriding || fe.overrideReason) && (
              <Field label="Reason for overriding the calculated result" htmlFor="overrideReason" required error={fe.overrideReason} hint="Saved in the audit trail.">
                <input id="overrideReason" name="overrideReason" className={inputClass} />
              </Field>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-600">A QC-authorized user confirms the final disposition.</p>
        )}
      </section>

      <FormMessage state={state} />
      <div className="flex flex-wrap items-start gap-3">
        <button name="intent" value="draft" className={secondaryButtonClass} disabled={pending}>
          {pending ? "Saving…" : "Save draft"}
        </button>
        {qcAuthorized ? (
          <button name="intent" value="confirm" className={buttonClass} disabled={pending}>
            Confirm inspection
          </button>
        ) : (
          <span className="flex flex-col gap-1">
            <button type="button" disabled className={`${buttonClass} cursor-not-allowed`}>
              Confirm inspection
            </button>
            <QcAuthNote />
          </span>
        )}
      </div>
    </form>
  );
}
