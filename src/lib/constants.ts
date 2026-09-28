// Allowed values for string "enum" columns in prisma/schema.prisma.

export const ROLES = ["warehouse", "qc", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const SUPPLIER_TYPES = [
  { value: "svlsg", label: "SVLSG supplier" },
  { value: "customer_supplied", label: "Customer-supplied" },
] as const;
export type SupplierType = (typeof SUPPLIER_TYPES)[number]["value"];

export function supplierTypeLabel(value: string) {
  return SUPPLIER_TYPES.find((t) => t.value === value)?.label ?? value;
}

export const QC_STATUSES = ["Quarantine", "Released", "Rejected"] as const;

export const SEGREGATION = ["none", "organic", "allergen", "refrigeration"] as const;

export const DOCUMENT_TYPES = [
  "COA",
  "Packing list",
  "Invoice",
  "Spec sheet",
  "Photo",
  "F.WD.001",
  "Other",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const TRANSACTION_TYPES = [
  { value: "receive", label: "Receive" },
  { value: "production_use", label: "Production use" },
  { value: "sample", label: "Sample" },
  { value: "sent_to_client", label: "Sent to client" },
  { value: "damaged_defect", label: "Damaged / defect" },
  { value: "adjustment", label: "Adjustment" },
] as const;

export const TEST_PATHS = [{ value: "ansi_sampling", label: "ANSI Z1.4 sampling (F.WD.003)" }] as const;
