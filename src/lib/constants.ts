// Allowed values for string "enum" columns in prisma/schema.prisma.

// Every user can use every screen. "admin" only adds managing users (incl. the QC flag).
// QC decisions are gated by User.qcAuthorized, not by role.
export const ROLES = ["user", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const QC_AUTH_REQUIRED = "Requires QC authorization";

export const SUPPLIER_TYPES = [
  { value: "svlsg", label: "SVLSG supplier" },
  { value: "customer_supplied", label: "Customer-supplied" },
] as const;
export type SupplierType = (typeof SUPPLIER_TYPES)[number]["value"];

export function supplierTypeLabel(value: string) {
  return SUPPLIER_TYPES.find((t) => t.value === value)?.label ?? value;
}

export const QC_STATUSES = ["Quarantine", "Released", "Rejected"] as const;

export const SEGREGATION = [
  { value: "none", label: "None" },
  { value: "organic", label: "Organic" },
  { value: "allergen", label: "Allergen" },
  { value: "refrigeration", label: "Refrigeration" },
] as const;

export function segregationLabel(value: string) {
  return SEGREGATION.find((s) => s.value === value)?.label ?? value;
}

export const DOCUMENT_TYPES = [
  "COA",
  "Packing list",
  "Invoice",
  "Spec sheet",
  "Photo",
  "F.WD.001",
  "Supplier questionnaire",
  "Supplier agreement",
  "Other",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

// Which document types each upload form offers.
export const LOT_DOCUMENT_TYPES = ["COA", "Packing list", "Invoice", "Photo", "F.WD.001", "Other"] as const;
export const ITEM_DOCUMENT_TYPES = ["Spec sheet", "Other"] as const;
export const SUPPLIER_DOCUMENT_TYPES = ["Supplier questionnaire", "Supplier agreement", "Other"] as const;
// Uploaded from a lot page but filed on the whole delivery (receipt).
export const RECEIPT_DOCUMENT_TYPES: readonly string[] = ["Invoice", "F.WD.001"];

export const TRANSACTION_TYPES = [
  { value: "receive", label: "Receive" },
  { value: "production_use", label: "Production use" },
  { value: "sample", label: "Sample" },
  { value: "sent_to_client", label: "Sent to client" },
  { value: "damaged_defect", label: "Damaged / defect" },
  { value: "adjustment", label: "Adjustment" },
] as const;

export function transactionTypeLabel(value: string) {
  return TRANSACTION_TYPES.find((t) => t.value === value)?.label ?? value;
}

export const TEST_PATHS = [{ value: "ansi_sampling", label: "ANSI Z1.4 sampling (F.WD.003)" }] as const;
