import { Card, CardContent } from "../ui/card";
import { Skeleton } from "../ui/skeleton";

export function AquaParkSectionSkeleton() {
  return (
    <section id="aquapark-at-serenity" className="flex flex-col gap-4">
      <Skeleton className="h-7 w-28" />
      <Card className="border-brand-primary/15 bg-brand-primary/5">
        <CardContent className="flex flex-col gap-5 px-6 py-6">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-36" />
            <Skeleton className="h-4 w-44" />
          </div>
          <div className="flex flex-col gap-2 border-t border-brand-primary/10 pt-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
