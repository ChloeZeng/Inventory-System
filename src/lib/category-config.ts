// Per-category configuration, stored as JSON in Category.config (plus the formNo,
// sortOrder, codePrefix, unit and testPath columns). The categories themselves are data
// (prisma/catalog.ts seeds them): changing a prefix, sub-type, unit, test path or required
// field means editing data, not writing new `if (category === ...)` branches.

export type SpecField = {
  key: string;
  label: string;
  type?: "text" | "select";
  options?: string[];
  required?: boolean; // required when creating a new item
};

// A requirement checked by the completeness engine (src/lib/completeness.ts).
// `source` says where to look: a record field, an attached document, or an inspection.
export type Requirement = {
  key: string;
  label: string;
  source: "field" | "document" | "inspection";
  // for source=field: "receipt.poInvoiceNo", "lot.unitCost", "item.specs.size", "supplier.aslApproved"
  path?: string;
  // for source=field: what counts as a correct answer (not just a filled-in one).
  //   "yes"      — a yes/no field must be Yes. The default for yes/no fields.
  //   "answered" — any answer counts, including No.
  //   "filled"   — any non-blank value; numbers must be above 0. The default for other fields.
  expect?: "yes" | "answered" | "filled";
  // for source=field: a calendar date that cannot be later than today (e.g. date received)
  notInFuture?: boolean;
  // for a yes/no field: a "No" is a legitimate answer that still needs follow-up
  // (e.g. a shortage against the packing list) until someone authorized resolves it.
  followUp?: {
    note?: string; // path of the explanation shown on the line, e.g. "receipt.qtyMatchNote"
    resolvedBy?: string; // path that, once filled, closes the follow-up, e.g. "receipt.qtyDiffResolution"
    owner?: RequirementOwner; // "qc": only a QC-authorized user may resolve it
  };
  // for source=document: document type and what it is attached to
  documentType?: string;
  attachedTo?: "item" | "receipt" | "lot" | "supplier";
  // several paths/types where any one satisfies the requirement
  anyOf?: string[];
  // the form, SOP or regulation the requirement comes from, e.g. "F.WD.003"
  ref?: string;
  // imperative wording for work lists, e.g. "Confirm quarantine labels are applied to every box"
  // (falls back to a verb + label); followUpTask: the same for a "Needs follow-up" answer
  task?: string;
  followUpTask?: string;
  // "qc": a QC decision, done only by a QC-authorized user and listed only on their to-do.
  // Default: "qc" for inspections, "anyone" otherwise.
  owner?: RequirementOwner;
};

export type Stage = "at_receiving" | "before_release";

// Older stored configs may still say "warehouse" or "admin": both mean "anyone".
export type RequirementOwner = "anyone" | "qc" | "warehouse" | "admin";

// One F.WD.003 checklist question (spec §4.3). Answered Yes / No / N/A; a "No"
// must be recorded as a defect with a class.
export type InspectionQuestion = { key: string; label: string; group?: string };

// A category split into kinds that get their own code prefix, e.g. Silica:
// canister → IC-SGC-001, packet → IC-SGP-001. A new item of such a category starts
// with "Which kind?" and the answer decides its code.
export type SubType = { key: string; label: string; codePrefix: string };

export type CategoryConfig = {
  subTypes: SubType[];
  // the item's description (size, material, color…)
  specFields: SpecField[];
  requirements: Record<Stage, Requirement[]>;
  // checklist shown on each item of this category (e.g. spec sheet on file)
  itemRequirements: Requirement[];
  // incoming-inspection checklist for this category (empty: no checklist configured)
  inspectionChecklist: InspectionQuestion[];
};

const EMPTY: CategoryConfig = {
  subTypes: [],
  specFields: [],
  requirements: { at_receiving: [], before_release: [] },
  itemRequirements: [],
  inspectionChecklist: [],
};

export function parseCategoryConfig(json: string | null | undefined): CategoryConfig {
  if (!json) return EMPTY;
  try {
    const raw = JSON.parse(json) as Partial<CategoryConfig>;
    return {
      subTypes: raw.subTypes ?? [],
      specFields: raw.specFields ?? [],
      requirements: {
        at_receiving: raw.requirements?.at_receiving ?? [],
        before_release: raw.requirements?.before_release ?? [],
      },
      itemRequirements: raw.itemRequirements ?? [],
      inspectionChecklist: raw.inspectionChecklist ?? [],
    };
  } catch {
    return EMPTY;
  }
}

export function parseSpecs(json: string | null | undefined): Record<string, string> {
  if (!json) return {};
  try {
    return JSON.parse(json) as Record<string, string>;
  } catch {
    return {};
  }
}

export function formatSpecs(config: CategoryConfig, specs: Record<string, string>) {
  return config.specFields
    .map((f) => specs[f.key])
    .filter(Boolean)
    .join(" · ");
}

// Case-insensitive spec comparison, used to stop a second code being created
// for an item type that already exists.
export function sameSpecs(a: Record<string, string>, b: Record<string, string>) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((k) => (a[k] ?? "").trim().toLowerCase() === (b[k] ?? "").trim().toLowerCase());
}

// "F.IV.004 · Lids" — the inventory form number labels the category everywhere.
export function categoryLabel(c: { formNo?: string | null; name: string }) {
  return c.formNo ? `${c.formNo} · ${c.name}` : c.name;
}

// The code prefix for a new item: the sub-type's when the category has sub-types
// (null when the sub-type is missing or unknown), else the category's.
export function itemCodePrefix(category: { codePrefix: string }, config: CategoryConfig, subType?: string | null) {
  if (!config.subTypes.length) return category.codePrefix;
  return config.subTypes.find((t) => t.key === subType)?.codePrefix ?? null;
}

export function subTypeLabel(config: CategoryConfig, subType: string | null | undefined) {
  return config.subTypes.find((t) => t.key === subType)?.label ?? null;
}

// "unit", "kg", "tablet" — for "per unit", "per kg".
export function unitSingular(unit = "units") {
  return unit !== "kg" && unit.endsWith("s") ? unit.slice(0, -1) : unit;
}

// Quantity with the category's unit: "1 unit", "142,800 units", "25 kg", "1 tablet".
export function formatQty(n: number, unit = "units") {
  return `${n.toLocaleString()} ${Math.abs(n) === 1 ? unitSingular(unit) : unit}`;
}

