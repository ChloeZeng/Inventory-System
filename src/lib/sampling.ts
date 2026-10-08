// ANSI/ASQ Z1.4 single sampling plan, normal inspection (spec §4.2).
// Tables are seed data (prisma/seed.ts) — QA must verify them against the printed standard.

import type { PrismaClient } from "@prisma/client";

export const DEFECT_CLASSES = [
  { cls: "critical", label: "Critical", aql: "0.25" },
  { cls: "major", label: "Major", aql: "2.5" },
  { cls: "minor", label: "Minor", aql: "4.0" },
] as const;

export type AnsiTables = {
  codeLetters: { inspectionLevel: string; minLotSize: number; maxLotSize: number | null; codeLetter: string }[];
  sampleSizes: { codeLetter: string; sampleSize: number; sortOrder: number }[];
  plans: { codeLetter: string; aql: string; ac: number | null; re: number | null; arrow: string | null }[];
};

export type ClassPlan = {
  cls: string;
  label: string;
  aql: string;
  codeLetter: string; // after following arrows
  sampleSize: number;
  ac: number;
  re: number;
};

export type SamplingPlan = {
  inspectionLevel: string;
  lotSize: number;
  codeLetter: string; // from Table 1
  classes: ClassPlan[];
  sampleSize: number; // largest sample across classes — the one actually drawn
  hundredPercent: boolean;
};

export async function loadAnsiTables(db: PrismaClient): Promise<AnsiTables> {
  const [codeLetters, sampleSizes, plans] = await Promise.all([
    db.ansiCodeLetter.findMany({ orderBy: { minLotSize: "asc" } }),
    db.ansiSampleSize.findMany({ orderBy: { sortOrder: "asc" } }),
    db.ansiPlan.findMany(),
  ]);
  return { codeLetters, sampleSizes, plans };
}

export function samplingPlan(tables: AnsiTables, lotSize: number, inspectionLevel = "II"): SamplingPlan {
  const rows = tables.codeLetters.filter((r) => r.inspectionLevel === inspectionLevel);
  if (!rows.length) throw new Error(`No ANSI Table 1 rows for inspection level ${inspectionLevel}.`);
  // Lots smaller than the first row are inspected 100% anyway.
  const row =
    rows.find((r) => lotSize >= r.minLotSize && (r.maxLotSize === null || lotSize <= r.maxLotSize)) ?? rows[0];

  const letters = tables.sampleSizes; // sorted A..R
  const indexOf = (letter: string) => letters.findIndex((l) => l.codeLetter === letter);

  const classes = DEFECT_CLASSES.map(({ cls, label, aql }) => {
    // Follow ↑ / ↓ until a cell with Ac/Re. The sample size comes from the row we land on.
    let i = indexOf(row.codeLetter);
    for (let guard = 0; guard < letters.length; guard++) {
      const letter = letters[i]?.codeLetter;
      const cell = tables.plans.find((p) => p.codeLetter === letter && p.aql === aql);
      if (!cell) throw new Error(`No ANSI Table 2-A entry for ${letter} / AQL ${aql}.`);
      if (cell.ac !== null && cell.re !== null) {
        return {
          cls,
          label,
          aql,
          codeLetter: letter,
          sampleSize: Math.min(letters[i].sampleSize, lotSize),
          ac: cell.ac,
          re: cell.re,
        };
      }
      i += cell.arrow === "up" ? -1 : 1;
    }
    throw new Error(`ANSI Table 2-A arrows for AQL ${aql} do not lead to a plan.`);
  });

  const sampleSize = Math.max(...classes.map((c) => c.sampleSize));
  return {
    inspectionLevel,
    lotSize,
    codeLetter: row.codeLetter,
    classes,
    sampleSize,
    hundredPercent: sampleSize >= lotSize,
  };
}

export type DefectCounts = Record<(typeof DEFECT_CLASSES)[number]["cls"], number>;

// Spec §4.3: any class with defects ≥ its Re → Rejected; every class ≤ its Ac → Approved.
// Only a suggestion: the plan comes from seeded ANSI tables that QA must still verify,
// and QC always confirms the disposition explicitly (an override needs a reason).
export function calculatedDisposition(classes: Pick<ClassPlan, "cls" | "ac" | "re">[], defects: Partial<DefectCounts>) {
  if (!classes.length) return null;
  const counts = classes.map((c) => ({ c, n: defects[c.cls as keyof DefectCounts] }));
  if (counts.some(({ n }) => n === undefined || !Number.isInteger(n) || n < 0)) return null;
  if (counts.some(({ c, n }) => n! >= c.re)) return "Rejected" as const;
  if (counts.every(({ c, n }) => n! <= c.ac)) return "Approved" as const;
  return null;
}
