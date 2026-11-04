"use client";

import { useDetailShell } from "./shell";

// A small link that opens one of the detail page's "do:<name>" modals.
export function OpenActionLink({ name, children, className = "" }: { name: string; children: React.ReactNode; className?: string }) {
  const shell = useDetailShell();
  return (
    <button type="button" onClick={() => shell?.openAction(name)} className={`text-sm font-medium text-sky-700 hover:underline ${className}`}>
      {children}
    </button>
  );
}
