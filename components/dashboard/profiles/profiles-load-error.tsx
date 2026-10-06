"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ProfilesLoadError() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 px-6 py-12 text-center"
    >
      <TriangleAlert className="size-8 text-destructive" aria-hidden />
      <p className="font-medium">We couldn&apos;t load users</p>
      <p className="text-sm text-muted-foreground">Please try again in a moment.</p>
      <Button
        variant="outline"
        disabled={isPending}
        onClick={() => startTransition(() => router.refresh())}
      >
        {isPending && <LoaderCircle className="animate-spin" aria-hidden />}
        Try again
      </Button>
    </div>
  );
}