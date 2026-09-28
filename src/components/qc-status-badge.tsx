import { Badge } from "@/components/ui";

export function QcStatusBadge({ status }: { status: string }) {
  const tone = status === "Released" ? "green" : status === "Rejected" ? "red" : "amber";
  return <Badge tone={tone}>{status}</Badge>;
}
