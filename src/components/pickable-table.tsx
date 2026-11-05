"use client";

import Link from "next/link";
import { useState } from "react";
import { savePreference } from "@/app/actions";
import { secondaryButtonClass } from "@/components/ui";

// A table whose columns the user picks (beyond a fixed first column); the choice is saved
// per user under `prefKey`.
export type PickableColumn = { key: string; label: string; numeric?: boolean };
export type PickableRow = { id: number; href?: string; label: string; cells: Record<string, React.ReactNode> };

export function PickableTable({
  firstLabel,
  options,
  defaults,
  initial,
  rows,
  prefKey,
  empty,
}: {
  firstLabel: string;
  options: PickableColumn[];
  defaults: string[];
  initial: string[];
  rows: PickableRow[];
  prefKey: string;
  empty: string;
}) {
  const [selected, setSelected] = useState(initial);
  const columns = options.filter((o) => selected.includes(o.key));
  const save = (next: string[] | null) => {
    setSelected(next ?? defaults);
    void savePreference(prefKey, next);
  };
  const toggle = (key: string) => {
    const next = options.map((o) => o.key).filter((k) => (k === key ? !selected.includes(k) : selected.includes(k)));
    if (next.length) save(next);
  };

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <details className="relative">
          <summary className={`${secondaryButtonClass} cursor-pointer list-none px-3 py-1.5`}>Columns ({columns.length})</summary>
          <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
            <p className="mb-2 text-xs text-slate-500">Remembered for you.</p>
            <ul className="space-y-1 text-sm">
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
              Reset to default columns
            </button>
          </div>
        </details>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-slate-600">{firstLabel}</th>
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
                  {r.href ? (
                    <Link href={r.href} className="font-mono font-medium text-sky-700 hover:underline">
                      {r.label}
                    </Link>
                  ) : (
                    r.label
                  )}
                </td>
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-2 ${c.numeric ? "whitespace-nowrap text-right tabular-nums" : "text-slate-700"}`}>
                    {r.cells[c.key] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-500">{empty}</p>}
      </div>
    </div>
  );
}
