import { ProfileViewSkeleton } from "@/components/dashboard/profile/profile-view";

export default function MyProfileLoading() {
  return (
    <div className="mx-auto w-full  space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">My Profile</h1>
        <p className="text-sm text-muted-foreground">
          Your account details. This page is read-only.
        </p>
      </div>
      <ProfileViewSkeleton />
    </div>
  );
}