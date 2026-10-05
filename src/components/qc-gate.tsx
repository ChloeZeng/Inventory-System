import { QC_AUTH_REQUIRED } from "@/lib/constants";
import { buttonClass } from "@/components/ui";

// A QC decision (inspection disposition, release, reject, resolving a QC follow-up).
// QC-authorized users get the real control (`children`). Everyone else sees the
// same button disabled, with the note "Requires QC authorization".
// The server actions behind these controls check again (requireQcAuthorized).
export function QcGate({
  authorized,
  label,
  className = buttonClass,
  children,
}: {
  authorized: boolean;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  if (authorized) return <>{children}</>;
  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button type="button" disabled title="Requires QC authorization" className={`${className} cursor-not-allowed`}>
        {label}
      </button>
      <QcAuthNote />
    </div>
  );
}

export function QcAuthNote() {
  return (
    <p className="flex items-center gap-1 text-xs font-medium text-slate-600">
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden>
        <path
          fillRule="evenodd"
          d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z"
          clipRule="evenodd"
        />
      </svg>
      {QC_AUTH_REQUIRED}
    </p>
  );
}
