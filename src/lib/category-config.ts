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

// A requirement checked by the completeness engine (build step 4).
// `source` says where to look: a record field, an attached document, or an inspection.
export type Requirement = {
  key: string;
  label: string;
  source: "field" | "document" | "inspection";
  // for source=field: "receipt.poInvoiceNo", "lot.unitCost", "item.specs.size", ...
  path?: string;
  // for source=document: document type and what it is attached to
  documentType?: string;
  attachedTo?: "item" | "receipt" | "lot";
  // several paths/types where any one satisfies the requirement
  anyOf?: string[];
};

export type CategoryConfig = {
  specFields: SpecField[];
  requirements: {
    at_receiving: Requirement[];
    before_release: Requirement[];
  };
};

const EMPTY: CategoryConfig = {
  specFields: [],
  requirements: { at_receiving: [], before_release: [] },
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
