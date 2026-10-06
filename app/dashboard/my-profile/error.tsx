"use client";

import { ProfileStateMessage } from "@/components/dashboard/profile/profile-state-message";
import { Button } from "@/components/ui/button";

export default function MyProfileError({ reset }: { reset: () => void }) {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <ProfileStateMessage
        variant="error"
        action={
          <Button variant="outline" onClick={reset}>
            Try again
          </Button>
        }
      />
    </div>
  );
}