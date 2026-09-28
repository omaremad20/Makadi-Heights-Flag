import { Skeleton } from "../ui/skeleton";

export function BeachAccessSectionSkeleton() {
  return (
    <div id="serenity-beach-access" className="flex flex-col gap-4">
      <Skeleton className="h-7 w-32" />
      <div className="no-scrollbar  flex gap-4 overflow-x-auto  pb-2">
        <Skeleton className="h-40 w-64 shrink-0 rounded-2xl" />
        <Skeleton className="h-40 w-64 shrink-0 rounded-2xl" />
        <Skeleton className="h-40 w-64 shrink-0 rounded-2xl" />
      </div>
    </div>
  );
}
