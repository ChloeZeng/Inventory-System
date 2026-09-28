// Helpers shared by server actions.

export type ActionState = {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string>;
};

export function str(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export function bool(formData: FormData, key: string) {
  const v = formData.get(key);
  return v === "on" || v === "true" || v === "yes";
}

export function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong.";
}

// <input type="date"> value → UTC midnight, so the calendar day never shifts with time zone.
export function dateOnly(formData: FormData, key: string): Date | null {
  const v = str(formData, key);
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Both sites are in California: "today" for date defaults is the local calendar day there,
// not the server's (which may run in UTC).
export const BUSINESS_TIME_ZONE = "America/Los_Angeles";

export function todayDateInput() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE }).format(new Date());
}

export function toDateInput(d: Date | null | undefined) {
  return d ? d.toISOString().slice(0, 10) : "";
}

// Whole number ≥ min, or null when blank / invalid.
export function int(formData: FormData, key: string, min = 0): number | null {
  const v = str(formData, key);
  if (v === null || !/^\d+$/.test(v.replace(/,/g, ""))) return null;
  const n = Number(v.replace(/,/g, ""));
  return n >= min ? n : null;
}

// Money / decimal as a string Prisma can store in a Decimal column.
export function decimal(formData: FormData, key: string): string | null | "invalid" {
  const v = str(formData, key)?.replace(/[$,]/g, "");
  if (!v) return null;
  return /^\d+(\.\d+)?$/.test(v) ? v : "invalid";
}
