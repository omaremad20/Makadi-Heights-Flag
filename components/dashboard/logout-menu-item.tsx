"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { toast } from "sonner";

import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { logout } from "@/lib/services/auth/auth.service";
import { LOGIN_PATH } from "@/app/dashboard/access";

export function LogoutMenuItem() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleLogout() {
    startTransition(async () => {
      try {
        await logout();

        router.replace(LOGIN_PATH);
        router.refresh();
      } catch {
        toast.error("Could not sign out. Please try again.");
      }
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip="Logout"
            disabled={pending}
          >
            <LogOut />
            <span>{pending ? "Signing out…" : "Logout"}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Are you sure you want to logout?
          </AlertDialogTitle>

          <AlertDialogDescription>
            You will be signed out of your account and redirected to the
            login page.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            Cancel
          </AlertDialogCancel>

          <AlertDialogAction
            onClick={handleLogout}
            disabled={pending}
          >
            {pending ? "Signing out…" : "Logout"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}