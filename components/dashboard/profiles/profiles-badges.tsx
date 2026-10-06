import { BadgeCheck, CircleCheck, CircleX, Clock, ShieldCheck, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ProfileRole } from "@/lib/profiles/types";

// Every state is text + icon, never color alone.
export function RoleBadge({ role }: { role: ProfileRole }) {
  return role === "admin" ? (
    <Badge>
      <ShieldCheck aria-hidden /> Admin
    </Badge>
  ) : (
    <Badge variant="secondary">
      <UserRound aria-hidden /> Employee
    </Badge>
  );
}

export function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge variant="outline">
      <CircleCheck aria-hidden /> Active
    </Badge>
  ) : (
    <Badge variant="destructive">
      <CircleX aria-hidden /> Inactive
    </Badge>
  );
}

export function ApprovalBadge({ approved }: { approved: boolean }) {
  return approved ? (
    <Badge variant="outline">
      <BadgeCheck aria-hidden /> Approved
    </Badge>
  ) : (
    <Badge variant="secondary">
      <Clock aria-hidden /> Not approved
    </Badge>
  );
}