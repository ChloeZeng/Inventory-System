// F.WD.003 inspection entry (spec §4.3): reading the form and the rules for saving a
// draft versus confirming the disposition. Pure, so it can be tested without a database.

import type { InspectionQuestion } from "./category-config";
import { DEFECT_CLASSES, type DefectCounts } from "./sampling";

export type DefectClass = (typeof DEFECT_CLASSES)[number]["cls"];
export type ChecklistAnswer = { answer: "yes" | "no" | "na"; defectClass?: DefectClass };

export type InspectionValues = {
  casesSampled: number | null;
  itemsSampled: number | null;
  checklist: Record<string, ChecklistAnswer>;
  defects: Record<DefectClass, number | null>;
  defectNotes: string | null;
  comments: string | null;
};

const CLASSES = DEFECT_CLASSES.map((d) => d.cls) as DefectClass[];

function text(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// Whole number ≥ 0; "" → null; anything else → NaN (a format error).
function count(fd: FormData, key: string): number | null {
  const v = text(fd, key);
  if (v === null) return null;
  return /^\d+$/.test(v.replace(/,/g, "")) ? Number(v.replace(/,/g, "")) : NaN;
}

// Format checks only — what a draft needs. Incomplete answers are fine in a draft.
export function readInspectionForm(fd: FormData, questions: InspectionQuestion[]) {
  const fieldErrors: Record<string, string> = {};
  const values: InspectionValues = {
    casesSampled: count(fd, "casesSampled"),
    itemsSampled: count(fd, "itemsSampled"),
    checklist: {},
    defects: { critical: null, major: null, minor: null },
    defectNotes: text(fd, "defectNotes"),
    comments: text(fd, "comments"),
  };
  for (const k of ["casesSampled", "itemsSampled"] as const)
    if (Number.isNaN(values[k])) fieldErrors[k] = "Enter a whole number.";
  for (const c of CLASSES) {
    const n = count(fd, `defects_${c}`);
    if (Number.isNaN(n)) fieldErrors[`defects_${c}`] = "Enter a whole number (0 if none).";
    else values.defects[c] = n;
  }
  for (const q of questions) {
    const a = text(fd, `q_${q.key}`);
    if (a !== "yes" && a !== "no" && a !== "na") continue;
    const cls = text(fd, `qc_${q.key}`);
    values.checklist[q.key] = a === "no" && CLASSES.includes(cls as DefectClass) ? { answer: a, defectClass: cls as DefectClass } : { answer: a };
  }
  return { values, fieldErrors };
}

// Everything that must hold before QC can confirm a disposition.
export function confirmErrors(
  values: InspectionValues,
  questions: InspectionQuestion[],
  opts: { lotSize: number; disposition: string | null; calculated: "Approved" | "Rejected" | null; overrideReason: string | null },
) {
  const e: Record<string, string> = {};
  if (!values.itemsSampled) e.itemsSampled = "Enter how many items were inspected.";
  else if (values.itemsSampled > opts.lotSize) e.itemsSampled = `More than the ${opts.lotSize.toLocaleString()} units received.`;
  for (const c of CLASSES) if (values.defects[c] === null) e[`defects_${c}`] = "Enter the count (0 if none).";

  const noPerClass: Record<DefectClass, number> = { critical: 0, major: 0, minor: 0 };
  for (const q of questions) {
    const a = values.checklist[q.key];
    if (!a) e[`q_${q.key}`] = "Answer Yes, No or N/A.";
    else if (a.answer === "no") {
      if (!a.defectClass) e[`q_${q.key}`] = "A “No” must be recorded as a defect — pick its class.";
      else noPerClass[a.defectClass]++;
    }
  }
  // each "No" is at least one defect of its class (spec §4.3)
  for (const c of CLASSES) {
    const n = values.defects[c];
    if (n !== null && n < noPerClass[c]) e[`defects_${c}`] = `At least ${noPerClass[c]} — one per “No” answer classed ${c}.`;
  }

  if (opts.disposition !== "Approved" && opts.disposition !== "Rejected") e.disposition = "Choose Approved or Rejected.";
  else if (opts.calculated && opts.disposition !== opts.calculated && !opts.overrideReason)
    e.overrideReason = `The plan suggests ${opts.calculated}. Overriding it needs a written reason.`;
  return e;
}

export function defectCounts(values: InspectionValues): Partial<DefectCounts> {
  return Object.fromEntries(CLASSES.filter((c) => values.defects[c] !== null).map((c) => [c, values.defects[c]!]));
}

export function parseChecklist(json: string | null | undefined): Record<string, ChecklistAnswer> {
  try {
    return json ? (JSON.parse(json) as Record<string, ChecklistAnswer>) : {};
  } catch {
    return {};
  }
}
