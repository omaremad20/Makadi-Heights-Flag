"use client";

import { useState, useTransition } from "react";
import { FileCheck, LoaderCircle, Printer } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useApplicationPdf } from "@/hooks/use-application-pdf";
import { updateApplicationStatusAction } from "@/lib/applications/actions";
import { formatDateTime, membershipLabel, periodLabel, userTypeLabel } from "@/lib/applications/labels";
import type { ApplicationStatusValue } from "@/lib/applications/list-params";
import type { ApplicationDetail } from "@/lib/applications/types";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words font-medium">{value || "—"}</dd>
    </div>
  );
}

const STATUS_ACTIONS: Array<{ status: ApplicationStatusValue; label: string; variant: "default" | "destructive" | "outline" }> = [
  { status: "approved", label: "Approve", variant: "default" },
  { status: "rejected", label: "Reject", variant: "destructive" },
  { status: "cancelled", label: "Cancel", variant: "outline" },
  { status: "pending", label: "Back to pending", variant: "outline" },
];

export function ApplicationOverview({
  detail,
  adminName,
  onChanged,
}: {
  detail: ApplicationDetail;
  adminName: string;
  onChanged: () => void;
}) {
  const app = detail.application;
  const [confirming, setConfirming] = useState<ApplicationStatusValue | null>(null);
  const [isPending, startTransition] = useTransition();
  const pdf = useApplicationPdf(adminName);

  const changeStatus = (status: ApplicationStatusValue) =>
    startTransition(async () => {
      const res = await updateApplicationStatusAction(app.id, status, app.updated_at);
      setConfirming(null);
      if (res.ok) toast.success(`Application marked as ${res.data.status}.`);
      else toast.error(res.message);
      onChanged();
    });

  return (
    <div className="space-y-5 text-sm">
      <dl className="grid grid-cols-2 gap-4 rounded-lg bg-muted/50 p-4 sm:grid-cols-3">
        <Field label="Unit" value={app.unit_number} />
        <Field label="Membership" value={membershipLabel(app.membership_type)} />
        <Field label="Period" value={periodLabel(app.period)} />
        <Field label="Applicant type" value={userTypeLabel(app.user_type)} />
        <Field label="People" value={app.persons_count} />
        <Field label="Nationality" value={app.nationality} />
        <Field label="Mobile" value={app.mobile} />
        <Field label="Email" value={app.email} />
        <Field label="Submitted" value={formatDateTime(app.created_at)} />
      </dl>

      {app.partner_name && (
        <section className="space-y-2 rounded-lg border p-4">
          <h3 className="font-medium">Partner</h3>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Name" value={app.partner_name} />
            <Field label="Nationality" value={app.partner_nationality} />
            <Field label="Mobile" value={app.partner_mobile} />
            <Field label="Email" value={app.partner_email} />
          </dl>
        </section>
      )}

      {app.additional_persons && app.additional_persons.length > 0 && (
        <section className="space-y-2 rounded-lg border p-4">
          <h3 className="font-medium">Additional people ({app.additional_persons.length})</h3>
          <ol className="divide-y">
            {app.additional_persons.map((p, i) => (
              <li key={p.id ?? i} className="flex flex-wrap justify-between gap-2 py-2">
                <span className="font-medium">
                  {i + 1}. {p.name}
                </span>
                <span className="text-muted-foreground">
                  {[p.relative, p.mobile].filter(Boolean).join(" · ") || "—"}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="space-y-3 rounded-lg border p-4">
        <h3 className="font-medium">Status</h3>
        <p className="text-muted-foreground">
          {app.status_updated_at
            ? `Last changed ${formatDateTime(app.status_updated_at)}${app.status_updated_by_email_snapshot ? ` by ${app.status_updated_by_email_snapshot}` : ""}.`
            : "Not reviewed yet."}
        </p>
        <div className="flex flex-wrap gap-2">
          {STATUS_ACTIONS.filter((a) => a.status !== app.status).map((a) => (
            <Button key={a.status} variant={a.variant} size="sm" disabled={isPending} onClick={() => setConfirming(a.status)}>
              {a.label}
            </Button>
          ))}
        </div>
      </section>

      <section className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={Boolean(pdf.busyKey)} onClick={() => void pdf.download(app, false)}>
          {pdf.busyKey === `${app.id}-unapproved` ? <LoaderCircle className="animate-spin" aria-hidden /> : <Printer aria-hidden />}
          Unapproved PDF
        </Button>
        <Button size="sm" disabled={Boolean(pdf.busyKey)} onClick={() => void pdf.download(app, true)}>
          {pdf.busyKey === `${app.id}-approved` ? <LoaderCircle className="animate-spin" aria-hidden /> : <FileCheck aria-hidden />}
          Approved PDF
        </Button>
      </section>

      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && !isPending && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark this application as {confirming}?</AlertDialogTitle>
            <AlertDialogDescription>
              {app.full_name}, unit {app.unit_number}. This change is recorded in the history with your name and the time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={(e) => {
                e.preventDefault();
                if (confirming) changeStatus(confirming);
              }}
            >
              {isPending && <LoaderCircle className="animate-spin" aria-hidden />}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
