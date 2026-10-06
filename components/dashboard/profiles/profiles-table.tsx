import Link from "next/link";
import { Eye, Users } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { hasActiveFilters } from "@/lib/profiles/filters";
import type { Profile, ProfileFilters } from "@/lib/profiles/types";
import { getDisplayName, getInitials } from "@/lib/profiles/utils";
import { ActiveBadge, ApprovalBadge, RoleBadge } from "./profiles-badges";
import { ProfileRowActions } from "./profiles-row-actions";

function Dash() {
  return (
    <span className="text-muted-foreground" aria-label="Not provided">
      —
    </span>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center">
      <Users className="size-8 text-muted-foreground" aria-hidden />
      <p className="font-medium">
        {filtered ? "No users found" : "No users yet"}
      </p>
      {filtered && (
        <>
          <p className="text-sm text-muted-foreground">
            Try a different search or adjust the filters.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/profiles">Clear filters</Link>
          </Button>
        </>
      )}
    </div>
  );
}

export function ProfilesTable({
  profiles,
  filters,
}: {
  profiles: Profile[];
  filters: ProfileFilters;
}) {
  if (profiles.length === 0)
    return <EmptyState filtered={hasActiveFilters(filters)} />;

  return (
    <div className="rounded-lg border">
      <Table>
        <TableCaption className="sr-only">
          Users and their access status
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead className="hidden lg:table-cell">Phone</TableHead>
            <TableHead className="hidden md:table-cell">Job title</TableHead>
            <TableHead className="hidden sm:table-cell">Role</TableHead>
            <TableHead className="hidden sm:table-cell">Status</TableHead>
            <TableHead className="hidden sm:table-cell">Approval</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {profiles.map((profile) => {
            const name = getDisplayName(profile);
            return (
              <TableRow key={profile.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage
                        src={profile.avatar_url ?? undefined}
                        alt=""
                        referrerPolicy="no-referrer"
                      />
                      <AvatarFallback>{getInitials(profile)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 max-w-56 md:max-w-[18rem]">
                      <p className="truncate font-medium">{name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {profile.email}
                      </p>
                      {/* Mobile: the hidden columns collapse into this badge row */}
                      <div className="mt-1.5 flex flex-wrap gap-1 sm:hidden">
                        <RoleBadge role={profile.role} />
                        <ActiveBadge active={profile.is_active} />
                        <ApprovalBadge approved={profile.approved} />
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {profile.phone ?? <Dash />}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {profile.job_title ?? <Dash />}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <RoleBadge role={profile.role} />
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <ActiveBadge active={profile.is_active} />
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <ApprovalBadge approved={profile.approved} />
                </TableCell>
                <TableCell className="text-right">
                  {profile.role === "employee" ? (
                    <ProfileRowActions profile={profile} />
                  ) : (
                    // Backend rejects changes to admin rows, so the only action is View.
                    <Button
                      asChild
                      variant="ghost"
                      size="icon"
                      className="size-10 sm:size-8"
                    >
                      <Link
                        href={`/dashboard/profiles/${profile.id}`}
                        aria-label={`View ${name}`}
                      >
                        <Eye aria-hidden />
                      </Link>
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
