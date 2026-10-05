"use client";

import { QcGate } from "@/components/qc-gate";
import { buttonClass, secondaryButtonClass } from "@/components/ui";
import { useDetailShell } from "./shell";
import type { NextActionButton } from "./types";

const TONES = {
  action: "border-sky-300 bg-sky-50",
  ready: "border-emerald-300 bg-emerald-50",
  stop: "border-red-300 bg-red-50",
  quiet: "border-slate-200 bg-white",
};

// The big "What's next" card: one sentence and one primary button.
export function NextActionCard({
  sentence,
  tone = "action",
  primary,
  secondary,
  qcAuthorized,
}: {
  sentence: React.ReactNode;
  tone?: keyof typeof TONES;
  primary?: NextActionButton;
  secondary?: NextActionButton;
  qcAuthorized: boolean;
}) {
  return (
    <section aria-label="What's next" className={`flex flex-wrap items-center justify-between gap-4 rounded-xl border-2 px-5 py-4 ${TONES[tone]}`}>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">What’s next</p>
        <p className="mt-0.5 text-lg font-medium leading-snug">{sentence}</p>
      </div>
      <div className="flex flex-wrap items-start gap-3">
        {secondary && <ActionButton button={secondary} qcAuthorized={qcAuthorized} className={secondaryButtonClass} />}
        {primary && <ActionButton button={primary} qcAuthorized={qcAuthorized} className={`${buttonClass} px-5 py-2.5 text-base`} />}
      </div>
    </section>
  );
}

function ActionButton({ button, qcAuthorized, className }: { button: NextActionButton; qcAuthorized: boolean; className: string }) {
  const shell = useDetailShell();
  const onClick = () => {
    if (button.kind === "fix") shell?.openFix(button.key);
    else if (button.kind === "tab") shell?.selectTab(button.tab);
    else shell?.openAction(button.name);
  };
  const el = (
    <button type="button" onClick={onClick} className={className}>
      {button.label} →
    </button>
  );
  return button.kind === "do" && button.qcOnly ? (
    <QcGate authorized={qcAuthorized} label={button.label} className={className}>
      {el}
    </QcGate>
  ) : (
    el
  );
}
