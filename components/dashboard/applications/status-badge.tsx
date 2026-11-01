import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STYLES: Record<string, string> = {
  pending: "border-amber-300 bg-amber-50 text-amber-900",
  approved: "border-emerald-300 bg-emerald-50 text-emerald-900",
  rejected: "border-red-300 bg-red-50 text-red-900",
  cancelled: "border-neutral-300 bg-neutral-100 text-neutral-800",
};

export function ApplicationStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn("capitalize", STYLES[status] ?? STYLES.cancelled, className)}>
      {status}
    </Badge>
  );
}
