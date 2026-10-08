import type { InspectionQuestion } from "@/lib/category-config";
import { parseChecklist } from "@/lib/inspection";
import { Badge, formatDateTime } from "@/components/ui";

type ConfirmedInspection = {
  disposition: string | null;
  calculatedDisposition: string | null;
  overrideReason: string | null;
  casesSampled: number | null;
  itemsSampled: number | null;
  sampleSize: number | null;
  lotSize: number;
  criticalDefects: number;
  majorDefects: number;
  minorDefects: number;
  defectNotes: string | null;
  comments: string | null;
  checklist: string;
  inspectedBy: { name: string };
  inspectedAt: Date;
  confirmedBy: { name: string } | null;
  confirmedAt: Date | null;
};

const ANSWER = { yes: "Yes", no: "No", na: "N/A" } as const;

// A confirmed F.WD.003 inspection, read-only.
export function InspectionResult({ inspection: i, questions }: { inspection: ConfirmedInspection; questions: InspectionQuestion[] }) {
  const checklist = parseChecklist(i.checklist);
  return (
    <div className="space-y-4 text-sm">
      <p className="flex flex-wrap items-center gap-2">
        <Badge tone={i.disposition === "Approved" ? "green" : "red"}>{i.disposition}</Badge>
        <span>
          Confirmed by {i.confirmedBy?.name ?? "—"}
          {i.confirmedAt && ` on ${formatDateTime(i.confirmedAt)}`} · results entered by {i.inspectedBy.name} on {formatDateTime(i.inspectedAt)}
        </span>
      </p>
      {i.overrideReason && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-900">
          Overrides the calculated result ({i.calculatedDisposition}): {i.overrideReason}
        </p>
      )}
      <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        <Row label="Items inspected">
          {i.itemsSampled?.toLocaleString() ?? "—"}
          {i.sampleSize !== null && ` (plan: ${i.sampleSize.toLocaleString()} of ${i.lotSize.toLocaleString()})`}
        </Row>
        <Row label="Cases sampled">{i.casesSampled ?? "—"}</Row>
        <Row label="Defects (critical / major / minor)">
          {i.criticalDefects} / {i.majorDefects} / {i.minorDefects}
        </Row>
        <Row label="Calculated from plan">{i.calculatedDisposition ?? "No plan"}</Row>
        {i.defectNotes && <Row label="Defect notes">{i.defectNotes}</Row>}
        {i.comments && <Row label="Comments">{i.comments}</Row>}
      </dl>
      {questions.length > 0 && (
        <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {questions.map((q) => {
            const a = checklist[q.key];
            return (
              <li key={q.key} className="flex justify-between gap-3 border-b border-slate-100 py-1">
                <span className="text-slate-600">{q.label}</span>
                <span className={a?.answer === "no" ? "font-medium text-red-700" : ""}>
                  {a ? ANSWER[a.answer] : "—"}
                  {a?.defectClass && ` (${a.defectClass})`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
