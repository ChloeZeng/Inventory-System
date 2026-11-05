"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800">
      Print
    </button>
  );
}
