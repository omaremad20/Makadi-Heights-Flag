import { Skeleton } from "@/components/ui/skeleton";

export function ProfilesTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="rounded-lg border" role="status" aria-label="Loading users">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b p-4 last:border-b-0">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
          <Skeleton className="hidden h-6 w-20 sm:block" />
          <Skeleton className="size-8" />
        </div>
      ))}
    </div>
  );
}