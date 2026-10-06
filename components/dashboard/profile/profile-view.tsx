import type { ReactNode } from "react";
import { CircleCheck, CircleX, Clock, ShieldCheck } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatDate,
  formatDateTime,
  getInitials,
  roleLabel,
  shortId,
} from "@/lib/profile/format";
import type { Profile } from "@/lib/profile/types";
import { ProfilePhoneEditor } from "./profile-phone-editor";

/* ----------------------------- small building blocks ---------------------------- */

function NotProvided() {
  return (
    <span className="font-normal text-muted-foreground">Not provided</span>
  );
}

function Field({
  label,
  value,
  className,
}: {
  label: string;
  value?: ReactNode;
  className?: string;
}) {
  const isEmpty = value === null || value === undefined || value === "";
  return (
    <div className={className}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 min-w-0 wrap-break-word text-sm font-medium">
        {isEmpty ? <NotProvided /> : value}
      </dd>
    </div>
  );
}

function FieldGrid({ children }: { children: ReactNode }) {
  return <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">{children}</dl>;
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function DateValue({
  iso,
  format,
}: {
  iso: string;
  format: (value: string) => string | null;
}) {
  const text = format(iso);
  return text ? <time dateTime={iso}>{text}</time> : null;
}

function IdValue({ id, full = false }: { id: string; full?: boolean }) {
  return (
    <code
      title={id}
      className={full ? "break-all font-mono text-xs" : "font-mono text-xs"}
    >
      {full ? id : shortId(id)}
    </code>
  );
}

function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge variant="secondary">
      <CircleCheck />
      Active
    </Badge>
  ) : (
    <Badge variant="destructive">
      <CircleX />
      Inactive
    </Badge>
  );
}

function ApprovalBadge({ approved }: { approved: boolean }) {
  return approved ? (
    <Badge variant="secondary">
      <ShieldCheck />
      Approved
    </Badge>
  ) : (
    <Badge variant="outline">
      <Clock />
      Pending approval
    </Badge>
  );
}

/* ---------------------------------- main view ---------------------------------- */

type ProfileViewProps = {
  profile: Profile;
  providerAvatarUrl: string | null;
};

export function ProfileView({ profile, providerAvatarUrl }: ProfileViewProps) {
  const avatarSrc = profile.avatar_url ?? providerAvatarUrl ?? undefined;
  const displayName = profile.full_name?.trim() || null;
  const hasApprover = Boolean(
    profile.approved_by || profile.approved_by_email_snapshot,
  );

  return (
    <div className="space-y-6">
      {/* Summary */}
      <Card>
        <CardContent className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <Avatar className="size-20">
            <AvatarImage
              src={avatarSrc}
              alt={displayName ?? profile.email}
              referrerPolicy="no-referrer"
            />
            <AvatarFallback className="text-xl">
              {getInitials(profile.full_name, profile.email)}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 space-y-3">
            <div className="space-y-0.5">
              <h2 className="wrap-break-word text-xl font-semibold">
                {displayName ?? "Name not set"}
              </h2>
              <p className="break-all text-sm text-muted-foreground">
                {profile.email}
              </p>
              {profile.job_title ? (
                <p className="text-sm">{profile.job_title}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
              <Badge
                variant={profile.role === "admin" ? "default" : "secondary"}
              >
                {roleLabel(profile.role)}
              </Badge>
              <ActiveBadge active={profile.is_active} />
              <ApprovalBadge approved={profile.approved} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Personal Information">
          <FieldGrid>
            <Field label="Full Name" value={displayName} />
            <Field
              label="Email"
              value={<span className="break-all">{profile.email}</span>}
            />
            <Field
              label="Phone"
              value={<ProfilePhoneEditor phone={profile.phone} />}
            />
            <Field label="Job Title" value={profile.job_title} />
          </FieldGrid>
        </Section>

        <Section title="Account Information">
          <FieldGrid>
            <Field label="Role" value={roleLabel(profile.role)} />
            <Field
              label="Account Status"
              value={<ActiveBadge active={profile.is_active} />}
            />
            <Field
              label="Approval Status"
              value={<ApprovalBadge approved={profile.approved} />}
            />
            <Field
              label="Joined"
              value={<DateValue iso={profile.created_at} format={formatDate} />}
            />
            <Field
              label="Last Updated"
              className="sm:col-span-2"
              value={
                <DateValue iso={profile.updated_at} format={formatDateTime} />
              }
            />
          </FieldGrid>
        </Section>

        <Section title="Approval Information">
          {hasApprover ? (
            <FieldGrid>
              <Field
                label="Approved By"
                value={
                  profile.approved_by ? (
                    <IdValue id={profile.approved_by} />
                  ) : null
                }
              />
              <Field
                label="Approved By Email"
                value={
                  profile.approved_by_email_snapshot ? (
                    <span className="break-all">
                      {profile.approved_by_email_snapshot}
                    </span>
                  ) : null
                }
              />
            </FieldGrid>
          ) : (
            <p className="text-sm text-muted-foreground">
              {profile.approved
                ? "This profile is approved, but no approver is recorded."
                : "This profile hasn't been approved yet."}
            </p>
          )}
        </Section>

        <Section title="System Information">
          <FieldGrid>
            <Field
              label="Profile ID"
              className="sm:col-span-2"
              value={<IdValue id={profile.id} full />}
            />
            <Field
              label="Last Updated By"
              value={
                profile.last_updated_by ? (
                  <IdValue id={profile.last_updated_by} />
                ) : null
              }
            />
            <Field
              label="Last Updated By Email"
              value={
                profile.last_updated_by_email_snapshot ? (
                  <span className="break-all">
                    {profile.last_updated_by_email_snapshot}
                  </span>
                ) : null
              }
            />
          </FieldGrid>
        </Section>
      </div>
    </div>
  );
}

/* --------------------------------- loading view -------------------------------- */

function SectionSkeleton({ rows }: { rows: number }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-2">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-36" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function ProfileViewSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading profile">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 sm:flex-row">
          <Skeleton className="size-20 rounded-full" />
          <div className="space-y-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-56" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionSkeleton rows={4} />
        <SectionSkeleton rows={5} />
        <SectionSkeleton rows={2} />
        <SectionSkeleton rows={3} />
      </div>
    </div>
  );
}
