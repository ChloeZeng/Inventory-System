// Shown while a page in the app loads (e.g. a large Lots query).
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">Loading…</span>
      <div className="h-7 w-48 animate-pulse rounded bg-slate-200" />
      <div className="h-10 w-full animate-pulse rounded bg-slate-100" />
      <div className="h-64 w-full animate-pulse rounded-lg bg-slate-100" />
    </div>
  );
}
