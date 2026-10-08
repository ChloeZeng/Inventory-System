// Lot detail page: turns the completeness results into what the top area shows —
// requirement groups (open items + collapsed completed ones), the one-field form
// each "Fix" button opens, and the single "What's next" sentence and button.

import type { FixInput, FixSpec, NextActionButton, OpenItem, RequirementGroup } from "@/components/detail/types";
import { stageCounts, type CheckResult, type CheckSummary } from "./completeness";
import { SEGREGATION } from "./constants";
import type { Workflow } from "./workflow";

// Current values of the editable fields, as form strings ("" when blank).
export type LotFieldValues = Record<string, string>;

type Ctx = {
  values: LotFieldValues;
  locations: { id: number; name: string }[];
  itemCode: string;
  receivingNo: string;
};

const GROUP_TITLES: Record<string, string> = { at_receiving: "Receiving details", before_release: "Before release" };

const fieldName = (path: string) => path.split(".").pop() ?? path;

function inputFor(field: string, ctx: Ctx): FixInput | null {
  const v = ctx.values[field] ?? "";
  switch (field) {
    case "poInvoiceNo":
      return { field, label: "PO / invoice no.", input: "text", value: v, hint: `Shared by every lot on ${ctx.receivingNo}.` };
    case "trackingNo":
      return { field, label: "Tracking no.", input: "text", value: v };
    case "unitCost":
      return { field, label: "Unit cost (per unit, $)", input: "decimal", value: v, hint: "e.g. 0.0125" };
    case "supplierBatchNo":
      return { field, label: "Supplier batch no.", input: "text", value: v };
    case "lotNo":
      return { field, label: "Lot no.", input: "text", value: v };
    case "mfgDate":
      return { field, label: "Mfg date", input: "date", value: v };
    case "expDate":
      return { field, label: "Exp date", input: "date", value: v };
    case "segregation":
      return { field, label: "Special segregation", input: "select", value: v, options: SEGREGATION.map((s) => ({ ...s })) };
    case "locationId":
      return { field, label: "Location", input: "select", value: v, options: ctx.locations.map((l) => ({ value: String(l.id), label: l.name })) };
    default:
      return null;
  }
}

const CONFIRM: Record<string, string> = {
  carrierInspectionDone: "The truck was inspected and F.WD.001 is completed.",
  quarantineStickerApplied: "A QUARANTINE sticker is on every box.",
};

export function lotFixSpec(r: CheckResult, ctx: Ctx): FixSpec {
  const { req } = r;
  if (req.source === "inspection") return { kind: "tab", tab: "inspection", label: r.status === "followup" ? "Open inspection" : "Enter inspection results" };

  if (req.source === "document") {
    const types = req.anyOf ?? (req.documentType ? [req.documentType] : []);
    if (req.attachedTo === "item")
      return { kind: "upload", target: "item", types, note: `Filed on item ${ctx.itemCode}, so every lot of it shares the file.` };
    return { kind: "upload", target: "lot", types, note: req.attachedTo === "receipt" ? `Filed on the whole delivery ${ctx.receivingNo}.` : undefined };
  }

  const paths = req.anyOf ?? (req.path ? [req.path] : []);
  const field = fieldName(paths[0] ?? "");

  const answer =
    field === "qtyMatchesPackingList"
      ? ({
          kind: "answer",
          field,
          noteField: "qtyMatchNote",
          question: "Does the total match the packing list / PO?",
          value: (ctx.values[field] ?? "") as "" | "yes" | "no",
          note: ctx.values.qtyMatchNote ?? "",
        } as const)
      : undefined;
  if (req.followUp && r.status === "followup")
    return { kind: "resolve", question: `${req.label}: answered No`, note: ctx.values[fieldName(req.followUp.note ?? "")] ?? "", correction: answer };
  if (answer) return answer;
  if (CONFIRM[field]) return { kind: "confirm", field, statement: CONFIRM[field] };

  const inputs = paths.map((p) => inputFor(fieldName(p), ctx)).filter((i): i is FixInput => !!i);
  if (inputs.length) return { kind: "fields", inputs, correcting: inputs.some((i) => i.value !== "") };

  // e.g. date received, cases: fixed when the receipt was saved
  return {
    kind: "link",
    href: "?tab=history",
    label: "See the history",
    message: `${req.label} was recorded at receiving and can’t be edited afterwards. Ask an admin to correct it.`,
  };
}

export function lotRequirementGroups(summary: CheckSummary, ctx: Ctx): RequirementGroup[] {
  return (["at_receiving", "before_release"] as const).map((stage) => {
    const counts = stageCounts(summary, stage); // same counting as everywhere else
    const rows = summary.results.filter((r) => r.stage === stage);
    return {
      stage,
      title: GROUP_TITLES[stage],
      met: counts.met,
      total: counts.total,
      open: counts.open.map(
        (r): OpenItem => ({
          key: r.req.key,
          label: r.req.label,
          ref: r.req.ref,
          status: r.status === "followup" ? "followup" : "missing",
          detail: r.detail,
          fix: lotFixSpec(r, ctx),
        }),
      ),
      done: rows
        .filter((r) => r.status === "done" || r.status === "na")
        .map((r) => ({ key: r.req.key, label: r.req.label, ref: r.req.ref, detail: r.detail, status: r.status as "done" | "na" })),
    };
  });
}

export type NextAction = {
  sentence: string;
  tone: "action" | "ready" | "stop" | "quiet";
  primary?: NextActionButton;
  secondary?: NextActionButton;
  waiting?: string; // who or what the lot is waiting for, when this user cannot act
};

// The workflow's destination (?fix= / ?tab= / ?do=) as an in-page action on the lot page.
function buttonFor(label: string, href: string | null): NextActionButton | undefined {
  if (!href) return undefined;
  const q = new URLSearchParams(href.split("?")[1] ?? "");
  if (q.get("fix")) return { kind: "fix", key: q.get("fix")!, label };
  if (q.get("tab")) return { kind: "tab", tab: q.get("tab")!, label };
  const action = q.get("do");
  if (action) return { kind: "do", name: action, label, qcOnly: action === "release" || action === "reject" };
  return undefined;
}

// "What's next" on the lot page, from the shared workflow selector (src/lib/workflow.ts).
export function lotNextAction(wf: Workflow, opts: { rejected?: string } = {}): NextAction {
  const c = wf.current;
  const tone: NextAction["tone"] =
    wf.stage === "rejected" || wf.stage === "failed"
      ? "stop"
      : wf.stage === "released" || wf.stage === "depleted"
        ? "quiet"
        : wf.stage === "release" && !wf.releaseBlocked
          ? "ready"
          : "action";
  // a QC-authorized user can reject a quarantined lot at any point
  const secondary: NextActionButton | undefined =
    wf.queues.inspection || (wf.queues.release && wf.stage !== "failed") || wf.stage === "receiving"
      ? { kind: "do", name: "reject", label: "Reject lot", qcOnly: true }
      : undefined;
  return {
    sentence: wf.stage === "rejected" && opts.rejected ? opts.rejected : c.sentence,
    tone,
    primary: c.canDo ? buttonFor(c.label, c.href) : undefined,
    secondary,
    waiting: c.canDo ? undefined : c.waitingFor,
  };
}
