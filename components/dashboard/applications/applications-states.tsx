"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderSearch, LoaderCircle, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function ApplicationsTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="rounded-lg border" role="status" aria-label="Loading applications">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b p-4 last:border-b-0">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
          <Skeleton className="hidden h-4 w-24 md:block" />
          <Skeleton className="hidden h-4 w-28 lg:block" />
          <Skeleton className="h-6 w-20" />
          <Skeleton className="size-8" />
        </div>
      ))}
    </div>
  );
}

export function ApplicationsLoadError() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 px-6 py-12 text-center">
      <TriangleAlert className="size-8 text-destructive" aria-hidden />
      <p className="font-medium">We couldn&apos;t load applications</p>
      <p className="text-sm text-muted-foreground">Please try again in a moment.</p>
      <Button variant="outline" disabled={isPending} onClick={() => startTransition(() => router.refresh())}>
        {isPending && <LoaderCircle className="animate-spin" aria-hidden />}
        Try again
      </Button>
    </div>
  );
}

export function ApplicationsEmpty({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border px-6 py-12 text-center">
      <FolderSearch className="size-8 text-muted-foreground" aria-hidden />
      <p className="font-medium">{filtered ? "No applications match these filters" : "No applications yet"}</p>
      {filtered && (
        <Button asChild variant="outline">
          <Link href="/dashboard/applications">Clear filters</Link>
        </Button>
      )}
    </div>
  );
}

export function ApplicationsPastEnd({ href }: { href: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border px-6 py-12 text-center">
      <FolderSearch className="size-8 text-muted-foreground" aria-hidden />
      <p className="font-medium">This page is past the end of the list</p>
      <Button asChild variant="outline">
        <Link href={href}>Go to the last page</Link>
      </Button>
    </div>
  );
}
