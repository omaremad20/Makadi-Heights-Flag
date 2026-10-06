import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full  space-y-6" aria-busy="true">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-10 w-full max-w-md" />
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}
