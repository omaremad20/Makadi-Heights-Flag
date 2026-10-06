"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ProfilesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      className="flex flex-col items-center gap-3 p-10 text-center"
      role="alert"
    >
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="text-sm text-muted-foreground">
        We couldn&apos;t load this page.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
