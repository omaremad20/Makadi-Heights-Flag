import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ProfileStateMessage } from "@/components/dashboard/profile/profile-state-message";
import { ProfileView } from "@/components/dashboard/profile/profile-view";
import { getCurrentProfile } from "@/lib/profile/get-current-profile";
import { LOGIN_PATH } from "../access";

export const metadata: Metadata = { title: "My Profile" };

export default async function MyProfilePage() {
  const result = await getCurrentProfile();

  // The proxy normally prevents this; fail safely if it ever happens.
  if (result.status === "unauthenticated") {
    redirect(LOGIN_PATH);
  }

  return (
    <div className="mx-auto w-full  space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">My Profile</h1>
        <p className="text-sm text-muted-foreground">
          Your account details. This page is read-only.
        </p>
      </div>

      {result.status === "ok" ? (
        <ProfileView
          profile={result.profile}
          providerAvatarUrl={result.providerAvatarUrl}
        />
      ) : (
        <ProfileStateMessage variant={result.status} />
      )}
    </div>
  );
}