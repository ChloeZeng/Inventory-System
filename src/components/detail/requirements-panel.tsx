"use client";

import { useState } from "react";
import { useDetailShell } from "./shell";
import type { OpenItem, RequirementGroup } from "./types";

// Top-of-page checklist: open items (missing / needs follow-up) are listed, each
// with one button; completed requirements collapse into one line per group,
// e.g. "Receiving details 11/11 complete ✓", expandable on click.
export function RequirementsPanel({ groups, canFix }: { groups: RequirementGroup[]; canFix: boolean }) {
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <Group key={g.stage} group={g} canFix={canFix} />
      ))}
    </div>
  );
}

function Group({ group: g, canFix }: { group: RequirementGroup; canFix: boolean }) {
  const [showDone, setShowDone] = useState(false);
  const complete = g.open.length === 0;

  return (
    <section aria-label={g.title}>
      {complete ? (
        <button
          type="button"
          onClick={() => setShowDone(!showDone)}
          aria-expanded={showDone}
          className="flex w-full items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-left text-sm text-emerald-900 hover:bg-emerald-100"
        >
          <span className="font-medium">{g.title}</span>
          <span className="tabular-nums">
            {g.met}/{g.total} complete ✓
          </span>
          <Chevron open={showDone} className="ml-auto" />
        </button>
      ) : (
        <>
          <div className="mb-1 flex items-baseline gap-2 text-sm">
            <span className="font-semibold">{g.title}</span>
            <span className="tabular-nums text-slate-500">
              {g.met} of {g.total} met · {g.open.length} open
            </span>
          </div>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-md border border-slate-200 bg-white">
            {g.open.map((item) => (
              <OpenRow key={item.key} item={item} canFix={canFix} />
            ))}
          </ul>
          {g.done.length > 0 && (
            <button
              type="button"
              onClick={() => setShowDone(!showDone)}
              aria-expanded={showDone}
              className="mt-1 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
            >
              <Chevron open={showDone} />
              {showDone ? "Hide" : "Show"} {g.done.length} completed
            </button>
          )}
        </>
      )}
      {showDone && (
        <ul className="mt-1 space-y-0.5 rounded-md bg-slate-50 px-3 py-2 text-sm">
          {g.done.map((d) => (
            <li key={d.key} className="flex flex-wrap items-center gap-x-2">
              <span className={d.status === "na" ? "text-slate-400" : "text-emerald-700"} aria-hidden>
                {d.status === "na" ? "–" : "✓"}
              </span>
              <span className={d.status === "na" ? "text-slate-400" : ""}>{d.label}</span>
              {d.detail && <span className="text-slate-500">— {d.detail}</span>}
              {d.status === "na" && <span className="text-xs text-slate-400">not applicable</span>}
              {d.ref && <span className="ml-auto font-mono text-xs text-slate-400">{d.ref}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OpenRow({ item, canFix }: { item: OpenItem; canFix: boolean }) {
  const shell = useDetailShell();
  const followup = item.status === "followup";
  const button = item.fix.kind === "tab" ? item.fix.label : followup ? "Resolve" : "Fix";
  return (
    <li className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm ${followup ? "bg-amber-50/70" : "bg-red-50/40"}`}>
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${followup ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700"}`}
        aria-hidden
      >
        {followup ? "?" : "!"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-medium">{item.label}</span>
        <span className={`ml-2 text-xs ${followup ? "text-amber-800" : "text-red-700"}`}>{followup ? "Needs follow-up" : "Missing"}</span>
        {item.detail && <span className="block text-xs text-slate-600">{item.detail}</span>}
      </span>
      {item.ref && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">{item.ref}</span>}
      {canFix && (
        <button
          type="button"
          onClick={() => (item.fix.kind === "tab" ? shell?.selectTab(item.fix.tab) : shell?.openFix(item.key))}
          className="rounded-md border border-sky-600 bg-white px-3 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50"
        >
          {button}
        </button>
      )}
    </li>
  );
}

function Chevron({ open, className = "" }: { open: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""} ${className}`} aria-hidden>
      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
    </svg>
  );
}
