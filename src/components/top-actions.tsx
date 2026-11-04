import Link from "next/link";
import { buttonClass, secondaryButtonClass } from "@/components/ui";

// The two everyday actions, fixed at the top right of every page: in a sticky bar on wide
// screens and in the phone top bar. "Record usage" first asks which released lot.
export function TopActions({ compact = false }: { compact?: boolean }) {
  const size = compact ? "px-2.5 py-1.5 text-xs" : "";
  return (
    <div data-tour="actions" className="flex items-center gap-2">
      <Link href="/receive" className={`${buttonClass} ${size}`}>
        Receive delivery
      </Link>
      <Link href="/usage" className={`${secondaryButtonClass} ${size}`}>
        Record usage
      </Link>
    </div>
  );
}
