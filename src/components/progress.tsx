import Link from "next/link";
import type { CheckResult, CheckSummary } from "@/lib/completeness";
import { STAGE_LABELS } from "@/lib/completeness";
import { LOT_STEPS, type StepState } from "@/lib/lot-progress";
import { fixHref, type FixContext } from "@/lib/records";
import { Badge } from "@/components/ui";

// Receive → Quarantine → Inspect → Release → In use
export function Stepper({ states, captions }: { states: StepState[]; captions: (string | undefined)[] }) {
  return (
    <ol className="grid grid-cols-5 gap-1 text-center text-xs sm:text-sm">
      {LOT_STEPS.map((label, i) => {
        const s = states[i];
        const tone =
          s === "done"
            ? "border-emerald-500 bg-emerald-50 text-emerald-800"
            : s === "current"
              ? "border-sky-600 bg-sky-600 text-white shadow"
              : s === "failed"
                ? "border-red-600 bg-red-600 text-white shadow"
                : "border-slate-200 bg-white text-slate-400";
        return (
          <li key={label} className={`rounded-md border-2 px-2 py-2 ${tone}`} aria-current={s === "current" ? "step" : undefined}>
            <div className="font-semibold">
              {s === "done" ? "✓ " : s === "failed" ? "✕ " : `${i + 1}. `}
              {label}
            </div>
            {captions[i] && <div className={`mt-0.5 truncate ${s === "current" || s === "failed" ? "text-white/90" : "opacity-80"}`}>{captions[i]}</div>}
          </li>
        );
      })}
    </ol>
  );
}

export function CompletionBar({ summary, compact = false }: { summary: CheckSummary; compact?: boolean }) {
  const pct = summary.total ? Math.round((summary.met / summary.total) * 100) : 100;
  const color = summary.complete ? "bg-emerald-500" : pct >= 50 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className={compact ? "min-w-28" : ""}>
      <div className={`flex items-center justify-between gap-2 ${compact ? "text-xs" : "text-sm"}`}>
        <span className={compact ? "tabular-nums text-slate-600" : "font-medium"}>
          {summary.met} of {summary.total}
          {compact ? "" : " requirements met"}
        </span>
        {!compact && summary.complete && <Badge tone="green">Audit ready</Badge>}
      </div>
      <div className={`mt-1 overflow-hidden rounded-full bg-slate-200 ${compact ? "h-1.5" : "h-2.5"}`}>
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const STATUS = {
  done: { icon: "✓", label: "Done", cls: "text-emerald-700" },
  missing: { icon: "!", label: "Missing", cls: "text-red-700" },
  na: { icon: "–", label: "Not applicable", cls: "text-slate-400" },
};

// Requirement lines grouped by stage, each with its source form/SOP and a Fix button.
export function Checklist({ summary, ctx, canFix = true }: { summary: CheckSummary; ctx: FixContext; canFix?: boolean }) {
  const groups = Map.groupBy(summary.results, (r) => r.stage);
  return (
    <div className="space-y-4">
      {[...groups].map(([stage, rows]) => (
        <div key={stage}>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {STAGE_LABELS[stage]}{" "}
            <span className="font-normal normal-case tracking-normal">
              · {rows.filter((r) => r.status === "done").length}/{rows.filter((r) => r.status !== "na").length}
            </span>
          </h3>
          <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
            {rows.map((r) => (
              <ChecklistRow key={r.req.key} r={r} ctx={ctx} canFix={canFix} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ChecklistRow({ r, ctx, canFix }: { r: CheckResult; ctx: FixContext; canFix: boolean }) {
  const st = STATUS[r.status];
  return (
    <li className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm ${r.status === "missing" ? "bg-red-50/40" : ""}`}>
      <span className={`w-5 text-center font-bold ${st.cls}`} aria-hidden>
        {st.icon}
      </span>
      <span className="min-w-0 flex-1">
        {r.req.label}
        {r.detail && <span className="text-slate-500"> — {r.detail}</span>}
      </span>
      {r.req.ref && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">{r.req.ref}</span>}
      <span className={`w-24 text-xs ${st.cls}`}>{st.label}</span>
      <span className="w-12 text-right">
        {r.status === "missing" && canFix && (
          <Link href={fixHref(r.req, ctx)} className="rounded border border-sky-600 px-2 py-0.5 text-xs font-medium text-sky-700 hover:bg-sky-50">
            Fix
          </Link>
        )}
      </span>
    </li>
  );
}

// "Missing before release: Invoice no., Spec sheet, F.WD.003 inspection."
export function MissingSummary({ summary }: { summary: CheckSummary }) {
  if (summary.complete) return <span className="text-emerald-700">Nothing missing</span>;
  return (
    <span className="text-slate-600">
      Missing: {summary.missing.map((r) => r.req.label).join(", ")}
    </span>
  );
}
