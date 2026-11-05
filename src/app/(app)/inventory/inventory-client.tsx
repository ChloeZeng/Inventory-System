"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { savePreference } from "@/app/actions";
import type { Column, InventoryFilters, Row, View } from "@/lib/inventory-view";
import { QcStatusBadge } from "@/components/qc-status-badge";
import { inputClass, secondaryButtonClass } from "@/components/ui";
import { WarningIcon } from "@/components/warning-icon";

// ---- Filters (remembered per user, per view and category) -------------------------------------

export function InventoryFiltersForm({
  view,
  categoryId,
  q,
  filters,
  locations,
  owners,
  prefKey,
}: {
  view: View;
  categoryId: number | null;
  q?: string;
  filters: InventoryFilters;
  locations: { id: number; name: string }[];
  owners: string[];
  prefKey: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const base = { ...(categoryId ? { category: String(categoryId) } : {}), ...(view === "lot" ? { view } : {}) };

  function apply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const f: InventoryFilters = {};
    const loc = Number(fd.get("location"));
    if (loc) f.location = loc;
    const owner = String(fd.get("owner") ?? "");
    if (owner) f.owner = owner;
    const stock = String(fd.get("stock") ?? "");
    if (stock) f.stock = stock as InventoryFilters["stock"];
    const status = String(fd.get("status") ?? "");
    if (status) f.status = status as InventoryFilters["status"];
    const exp = Number(fd.get("exp"));
    if (exp > 0) f.expiringDays = exp;
    const search = String(fd.get("q") ?? "").trim();
    const params = new URLSearchParams({ ...base, ...(search ? { q: search } : {}), f: "1" });
    if (f.location) params.set("location", String(f.location));
    if (f.owner) params.set("owner", f.owner);
    if (f.stock) params.set("stock", f.stock);
    if (f.status) params.set("status", f.status);
    if (f.expiringDays) params.set("exp", String(f.expiringDays));
    start(async () => {
      await savePreference(prefKey, f); // remembered for next time
      router.push(`/inventory?${params}`);
    });
  }

  function reset() {
    start(async () => {
      await savePreference(prefKey, null);
      router.push(`/inventory?${new URLSearchParams(base)}`);
    });
  }

  return (
    <form onSubmit={apply} role="search" aria-label="Filter inventory" className="mb-3 flex flex-wrap items-end gap-2">
      <label className="text-xs text-slate-500">
        Search
        <input name="q" defaultValue={q} placeholder="Code, name, size, owner, product…" className={`${inputClass} mt-0.5 w-56`} />
      </label>
      <label className="text-xs text-slate-500">
        Stock
        <select name="stock" defaultValue={filters.stock ?? ""} className={`${inputClass} mt-0.5 w-auto`}>
          <option value="">{view === "lot" ? "All lots" : "All items"}</option>
          <option value="inStock">In stock</option>
          <option value="available">Available (released)</option>
          <option value="quarantine">In quarantine</option>
          <option value="none">No stock</option>
        </select>
      </label>
      {view === "lot" && (
        <>
          <label className="text-xs text-slate-500">
            Status
            <select name="status" defaultValue={filters.status ?? ""} className={`${inputClass} mt-0.5 w-auto`}>
              <option value="">Any</option>
              <option>Quarantine</option>
              <option>Released</option>
              <option>Rejected</option>
            </select>
          </label>
          <label className="text-xs text-slate-500">
            Expiry
            <select name="exp" defaultValue={filters.expiringDays ?? ""} className={`${inputClass} mt-0.5 w-auto`}>
              <option value="">Any</option>
              <option value="30">Within 30 days</option>
              <option value="90">Within 90 days</option>
              <option value="180">Within 180 days</option>
            </select>
          </label>
        </>
      )}
      <label className="text-xs text-slate-500">
        Location
        <select name="location" defaultValue={filters.location ?? ""} className={`${inputClass} mt-0.5 w-auto`}>
          <option value="">Any</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-slate-500">
        Owner
        <select name="owner" defaultValue={filters.owner ?? ""} className={`${inputClass} mt-0.5 w-auto`}>
          <option value="">Any</option>
          {owners.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </label>
      <button className={secondaryButtonClass} disabled={pending}>
        Apply
      </button>
      <button type="button" onClick={reset} disabled={pending} className="px-1 py-2 text-sm font-medium text-sky-700 hover:underline">
        Reset
      </button>
    </form>
  );
}

// ---- Table with a column picker (remembered) and export -----------------------------------------

export function InventoryTable({
  view,
  options,
  defaults,
  initialColumns,
  rows,
  prefKey,
  exportQuery,
}: {
  view: View;
  options: Column[];
  defaults: string[];
  initialColumns: string[];
  rows: Row[];
  prefKey: string;
  exportQuery: string; // the current view's URL query, without cols
}) {
  const [selected, setSelected] = useState(initialColumns);
  const columns = options.filter((o) => selected.includes(o.key));
  const save = (next: string[] | null) => {
    setSelected(next ?? defaults);
    void savePreference(prefKey, next);
  };
  const toggle = (key: string) => {
    const next = selected.includes(key) ? selected.filter((k) => k !== key) : options.map((o) => o.key).filter((k) => k === key || selected.includes(k));
    if (next.length) save(next);
  };
  const exportHref = (format: "csv" | "xlsx") => `/inventory/export?${exportQuery}${exportQuery ? "&" : ""}cols=${columns.map((c) => c.key).join(",")}&format=${format}`;

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
        <details className="relative">
          <summary className={`${secondaryButtonClass} cursor-pointer list-none px-3 py-1.5`}>Columns ({columns.length})</summary>
          <div className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
            <p className="mb-2 text-xs text-slate-500">Shown for {view === "lot" ? "lots" : "items"} in this tab. Remembered for you.</p>
            <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
              {options.map((o) => (
                <li key={o.key}>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={selected.includes(o.key)} onChange={() => toggle(o.key)} />
                    {o.label}
                  </label>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => save(null)} className="mt-2 text-xs font-medium text-sky-700 hover:underline">
              Reset to the category&apos;s default columns
            </button>
          </div>
        </details>
        <a href={exportHref("xlsx")} className={`${secondaryButtonClass} px-3 py-1.5`}>
          Export Excel
        </a>
        <a href={exportHref("csv")} className={`${secondaryButtonClass} px-3 py-1.5`}>
          Export CSV
        </a>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-slate-600">{view === "lot" ? "Lot no." : "Code"}</th>
              {columns.map((c) => (
                <th key={c.key} className={`px-4 py-2 font-medium text-slate-600 ${c.numeric ? "text-right" : "text-left"}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-2">
                  <Link href={r.href} className="font-mono font-medium text-sky-700 hover:underline">
                    {r.label}
                  </Link>
                  {r.warning && <WarningIcon text={r.warning} />}
                </td>
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-2 ${c.numeric ? "whitespace-nowrap text-right tabular-nums" : "text-slate-700"}`}>
                    {c.key === "status" && r.status ? (
                      <QcStatusBadge status={r.status} />
                    ) : c.key === "available" && r.chips ? (
                      <span className="inline-flex flex-col items-end gap-1">
                        <span className={/^0 /.test(r.cells.available) ? "text-slate-400" : "font-medium text-slate-900"}>{r.cells.available}</span>
                        <span className="flex gap-1 text-xs font-normal">
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800">Released {r.chips.released}</span>
                          <span className={`rounded-full px-2 py-0.5 ${/^0 /.test(r.chips.quarantine) ? "bg-slate-100 text-slate-500" : "bg-amber-50 text-amber-900"}`}>
                            Quarantine {r.chips.quarantine}
                          </span>
                        </span>
                      </span>
                    ) : (
                      r.cells[c.key] ?? "—"
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-500">Nothing matches.</p>}
      </div>
    </>
  );
}

