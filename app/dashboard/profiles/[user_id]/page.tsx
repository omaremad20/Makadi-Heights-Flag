import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, getDisplayName, getInitials, isUuid } from "@/lib/profiles/utils";
import { getProfileById } from "@/lib/services/profiles/profiles.service";
import { ActiveBadge, ApprovalBadge, RoleBadge } from "@/components/dashboard/profiles/profiles-badges";

type PageProps = { params: Promise<{ user_id: string }> };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="wrap-break-word text-sm">{children ?? "—"}</dd>
    </div>
  );
}

export default async function ProfileDetailsPage({ params }: PageProps) {
  const { user_id } = await params;
  if (!isUuid(user_id)) notFound();

  const profile = await getProfileById(user_id); // RLS decides what is visible
  if (!profile) notFound();

  const name = getDisplayName(profile);

  return (
    <div className="flex flex-col gap-6 ">
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/profiles">
            <ArrowLeft aria-hidden /> Back to profiles
          </Link>
        </Button>
        {profile.role === "employee" && (
          <Button asChild size="sm">
            <Link href={`/dashboard/profiles/modify/${profile.id}`}>
              <Pencil aria-hidden /> Modify
            </Link>
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-4">
          <Avatar className="size-14">
            <AvatarImage src={profile.avatar_url ?? undefined} alt="" referrerPolicy="no-referrer" />
            <AvatarFallback>{getInitials(profile)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-2">
            <CardTitle className="truncate text-xl">{name}</CardTitle>
            <div className="flex flex-wrap gap-1.5">
              <RoleBadge role={profile.role} />
              <ActiveBadge active={profile.is_active} />
              <ApprovalBadge approved={profile.approved} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="Email">{profile.email}</Field>
            <Field label="Phone">{profile.phone}</Field>
            <Field label="Job title">{profile.job_title}</Field>
            <Field label="User ID">
              <span className="font-mono text-xs">{profile.id}</span>
            </Field>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account activity</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="Created">{formatDateTime(profile.created_at)}</Field>
            <Field label="Last updated">{formatDateTime(profile.updated_at)}</Field>
            <Field label="Last updated by">{profile.last_updated_by_email_snapshot}</Field>
            <Field label="Approved by">{profile.approved_by_email_snapshot}</Field>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}