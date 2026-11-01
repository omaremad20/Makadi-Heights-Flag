"use client";

import { useState } from "react";
import { Eye, FileCheck, LoaderCircle, MoreHorizontal, Printer } from "lucide-react";

import { ApplicationDetailsSheet } from "@/components/dashboard/applications/application-details-sheet";
import { ApplicationStatusBadge } from "@/components/dashboard/applications/status-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApplicationPdf } from "@/hooks/use-application-pdf";
import { formatDate, membershipLabel, periodLabel } from "@/lib/applications/labels";
import type { ApplicationRow } from "@/lib/applications/types";

function RowActions({
  app,
  onReview,
  pdf,
}: {
  app: ApplicationRow;
  onReview: () => void;
  pdf: ReturnType<typeof useApplicationPdf>;
}) {
  const busy = pdf.busyKey?.startsWith(app.id);
  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="outline" size="sm" onClick={onReview}>
        <Eye aria-hidden />
        Review
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`More actions for ${app.full_name}`} disabled={Boolean(pdf.busyKey)}>
            {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <MoreHorizontal aria-hidden />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => void pdf.download(app, true)}>
            <FileCheck aria-hidden />
            Download approved PDF
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void pdf.download(app, false)}>
            <Printer aria-hidden />
            Download unapproved PDF
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function ApplicationsTable({ rows, adminName }: { rows: ApplicationRow[]; adminName: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const pdf = useApplicationPdf(adminName);

  return (
    <>
      {/* Phones: cards (no horizontal scrolling) */}
      <ul className="grid gap-3 md:hidden">
        {rows.map((app) => (
          <li key={app.id} className="rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{app.full_name}</p>
                <p className="text-sm text-muted-foreground">
                  Unit {app.unit_number} · {app.persons_count} {app.persons_count === 1 ? "person" : "people"}
                </p>
              </div>
              <ApplicationStatusBadge status={app.status} />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {membershipLabel(app.membership_type)} · {periodLabel(app.period)} · {formatDate(app.created_at)}
            </p>
            <div className="mt-3">
              <RowActions app={app} pdf={pdf} onReview={() => setOpenId(app.id)} />
            </div>
          </li>
        ))}
      </ul>

      {/* Tablet / desktop */}
      <div className="hidden rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Applicant</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead className="hidden lg:table-cell">Membership</TableHead>
              <TableHead className="hidden xl:table-cell">Contact</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((app) => (
              <TableRow key={app.id}>
                <TableCell className="max-w-[220px]">
                  <p className="truncate font-medium">{app.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {app.persons_count} {app.persons_count === 1 ? "person" : "people"}
                    {app.partner_name ? ` · with ${app.partner_name}` : ""}
                  </p>
                </TableCell>
                <TableCell>{app.unit_number}</TableCell>
                <TableCell className="hidden lg:table-cell">
                  <p>{membershipLabel(app.membership_type)}</p>
                  <p className="text-xs text-muted-foreground">{periodLabel(app.period)}</p>
                </TableCell>
                <TableCell className="hidden max-w-[220px] xl:table-cell">
                  <p className="truncate">{app.email ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{app.mobile ?? "—"}</p>
                </TableCell>
                <TableCell className="whitespace-nowrap">{formatDate(app.created_at)}</TableCell>
                <TableCell>
                  <ApplicationStatusBadge status={app.status} />
                </TableCell>
                <TableCell>
                  <RowActions app={app} pdf={pdf} onReview={() => setOpenId(app.id)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ApplicationDetailsSheet applicationId={openId} onClose={() => setOpenId(null)} adminName={adminName} />
    </>
  );
}
