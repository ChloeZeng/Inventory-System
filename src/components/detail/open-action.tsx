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

// The same as a button with its own styling (e.g. "Edit" at the top right).
export function OpenActionButton({ name, children, className }: { name: string; children: React.ReactNode; className: string }) {
  const shell = useDetailShell();
  return (
    <button type="button" onClick={() => shell?.openAction(name)} className={className}>
      {children}
    </button>
  );
}

// Switches the detail page to one of its tabs.
export function TabLink({ tab, children, className = "" }: { tab: string; children: React.ReactNode; className?: string }) {
  const shell = useDetailShell();
  return (
    <button type="button" onClick={() => shell?.selectTab(tab)} className={`text-sm font-medium text-sky-700 hover:underline ${className}`}>
      {children}
    </button>
  );
}
