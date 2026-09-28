// Per-category configuration, stored as JSON in Category.config.
// Adding a new category (e.g. Raw Ingredients) means adding data here via seed/admin,
// not writing new `if (category === ...)` branches.

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
  // for source=field on a yes/no field: only "yes" counts as done (e.g. quarantine sticker applied)
  requireTrue?: boolean;
  // for source=document: document type and what it is attached to
  documentType?: string;
  attachedTo?: "item" | "receipt" | "lot" | "supplier";
  // several paths/types where any one satisfies the requirement
  anyOf?: string[];
  // the form, SOP or regulation the requirement comes from, e.g. "F.WD.003"
  ref?: string;
  // which role's to-do list it lands on (default: qc for inspections, warehouse otherwise)
  owner?: "warehouse" | "qc" | "admin";
};

export type Stage = "at_receiving" | "before_release";

export type CategoryConfig = {
  specFields: SpecField[];
  requirements: Record<Stage, Requirement[]>;
  // checklist shown on each item of this category (e.g. spec sheet on file)
  itemRequirements: Requirement[];
};

const EMPTY: CategoryConfig = {
  specFields: [],
  requirements: { at_receiving: [], before_release: [] },
  itemRequirements: [],
};

export function parseCategoryConfig(json: string | null | undefined): CategoryConfig {
  if (!json) return EMPTY;
  try {
    const raw = JSON.parse(json) as Partial<CategoryConfig>;
    return {
      specFields: raw.specFields ?? [],
      requirements: {
        at_receiving: raw.requirements?.at_receiving ?? [],
        before_release: raw.requirements?.before_release ?? [],
      },
      itemRequirements: raw.itemRequirements ?? [],
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
