import Link from "next/link";

// Small shared building blocks so forms and tables look the same everywhere.

export const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-slate-100";

export const buttonClass =
  "inline-flex items-center justify-center rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-800 disabled:opacity-50";

export const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50";

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back.href} className="text-sm text-sky-700 hover:underline">
          ← {back.label}
        </Link>
      )}
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
        </div>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({
  title,
  children,
  className = "",
  id,
}: {
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`rounded-lg border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {title && <h2 className="mb-4 text-base font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

const BADGE_TONES = {
  gray: "bg-slate-100 text-slate-700",
  green: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
  blue: "bg-sky-100 text-sky-800",
};

export function Badge({ tone = "gray", children }: { tone?: keyof typeof BADGE_TONES; children: React.ReactNode }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_TONES[tone]}`}>{children}</span>;
}

export function Table({ head, children, empty }: { head: string[]; children: React.ReactNode; empty?: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-2 text-left font-medium text-slate-600">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

export function FormMessage({ state }: { state: { error?: string; ok?: string } | undefined }) {
  if (state?.error)
    return <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>;
  if (state?.ok)
    return <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.ok}</p>;
  return null;
}

export function formatDateTime(d: Date) {
  return d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

// Calendar dates (date received, mfg, exp) are stored as UTC midnight.
export function formatDate(d: Date | null | undefined) {
  return d ? d.toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" }) : "—";
}

export function formatMoney(v: { toString(): string } | number | null | undefined, digits = 4) {
  if (v === null || v === undefined) return "—";
  const n = Number(v.toString());
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: digits });
}
