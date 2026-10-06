"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Ellipsis,
  Eye,
  LoaderCircle,
  Pencil,
  Trash2,
  UserCheck,
  UserX,
} from "lucide-react";

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
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MutationResult, Profile } from "@/lib/profiles/types";
import { getDisplayName } from "@/lib/profiles/utils";
import { deactivateEmployeeAction, setEmployeeApprovalAction } from "@/lib/services/profiles/profiles.actions";

type DialogKind = "approval" | "deactivate" | null;
type Props = {
  profile: Pick<
    Profile,
    "id" | "email" | "full_name" | "is_active" | "approved"
  >;
};

export function ProfileRowActions({ profile }: Props) {
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [isPending, startTransition] = useTransition();

  const name = getDisplayName(profile);
  const nextApproved = !profile.approved;

  function run(action: () => Promise<MutationResult>, successMessage: string) {
    if (isPending) return; // duplicate-submit guard
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(successMessage);
      else toast.error(result.message);
      setDialog(null);
    });
  }

  // Dialogs can't be dismissed mid-request.
  const guardClose = (open: boolean) => {
    if (!open && !isPending) setDialog(null);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-10 sm:size-8"
            disabled={isPending}
            aria-label={`Actions for ${name}`}
          >
            {isPending ? (
              <LoaderCircle className="animate-spin" aria-hidden />
            ) : (
              <Ellipsis aria-hidden />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog("approval")}>
            {profile.approved ? (
              <UserX aria-hidden />
            ) : (
              <UserCheck aria-hidden />
            )}
            {profile.approved ? "Mark as not approved" : "Mark as approved"}
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/profiles/${profile.id}`}>
              <Eye aria-hidden /> View
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/profiles/modify/${profile.id}`}>
              <Pencil aria-hidden /> Modify
            </Link>
          </DropdownMenuItem>
          {profile.is_active && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setDialog("deactivate")}
              >
                <Trash2 aria-hidden /> Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Dialogs are siblings of the menu (not children) so focus handling stays correct. */}
      <AlertDialog open={dialog === "approval"} onOpenChange={guardClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {nextApproved ? "Approve this employee?" : "Remove approval?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {nextApproved
                ? `${name} will be marked as approved. Approved, active employees can access the dashboard.`
                : `${name} will be marked as not approved and will lose dashboard access until approved again.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
            className={!nextApproved ? "bg-destructive!" : ''}
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault(); // keep open until the request finishes
                run(
                  () => setEmployeeApprovalAction(profile.id, nextApproved),
                  nextApproved
                    ? `${name} approved`
                    : `Approval removed for ${name}`,
                );
              }}
            >
              {isPending && (
                <LoaderCircle className="animate-spin" aria-hidden />
              )}
              {nextApproved ? "Approve" : "Remove approval"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dialog === "deactivate"} onOpenChange={guardClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate employee?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate {name}&apos;s account and remove their active
              access. This action can be reversed by an authorized admin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              className={'bg-destructive!'}
              onClick={(event) => {
                event.preventDefault();
                run(
                  () => deactivateEmployeeAction(profile.id),
                  `${name} deactivated`,
                );
              }}
            >
              {isPending && (
                <LoaderCircle className="animate-spin" aria-hidden />
              )}
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
