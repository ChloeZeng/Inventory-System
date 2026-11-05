// Small amber warning sign with its explanation as a tooltip (and for screen readers),
// e.g. next to an item code whose record is incomplete.
export function WarningIcon({ text }: { text: string }) {
  return (
    <span title={text} className="ml-1.5 inline-flex align-middle text-amber-600">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3 2 21h20L12 3Zm0 7v5m0 3v.01" />
      </svg>
      <span className="sr-only">{text}</span>
    </span>
  );
}
