import { issueStatusLabel } from "@/lib/material-issue";
import { Badge } from "@/components/ui";

export function IssueStatusBadge({ status }: { status: string }) {
  return <Badge tone={status === "confirmed" ? "green" : status === "cancelled" ? "red" : "amber"}>{issueStatusLabel(status)}</Badge>;
}
