import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SeaConditionsCardSkeleton } from "@/components/flag/sea-conditions-card";
import { AquaParkSectionSkeleton } from "@/components/home/aqua-park-section";
import { BeachAccessSectionSkeleton } from "@/components/home/beach-access-section";

export default function Loading() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-7xl flex-col gap-10 px-6 py-12 sm:py-16">
      {/* Logo */}
      <Skeleton className="h-10 w-40" />

      {/* Sea conditions */}
      <div className="grid">
        <SeaConditionsCardSkeleton />
      </div>

      {/* Location card / map */}
      <Card className="overflow-hidden py-0! h-[50vh] border-brand-primary/15">
        <CardContent className="h-full p-0">
          <Skeleton className="h-full w-full rounded-none" />
        </CardContent>
      </Card>

      {/* Meal schedule */}
      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-32" />
        <div className="no-scrollbar -mx-6 flex gap-4 overflow-x-auto px-6 pb-2">
          <Skeleton className="h-40 w-64 shrink-0 rounded-2xl" />
          <Skeleton className="h-40 w-64 shrink-0 rounded-2xl" />
          <Skeleton className="h-40 w-64 shrink-0 rounded-2xl" />
        </div>
      </div>

      <AquaParkSectionSkeleton />
      <BeachAccessSectionSkeleton />

      {/* Menu button */}
      <Skeleton className="h-12 w-40 rounded-full" />

      {/* Footer */}
      <div className="border-t border-brand-primary/10 pt-6 pb-2">
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    </main>
  );
}
