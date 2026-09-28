import { Card, CardContent } from "../ui/card";
import { Skeleton } from "../ui/skeleton";

export default function SeaConditionsCardSkeleton() {
  return (
    <Card id="flag" className="border-brand-primary/15 bg-brand-primary/5">
      <CardContent className="flex flex-col gap-3 px-6 py-6">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-12 w-24" />
        <Skeleton className="h-4 w-40" />
        <div className="mt-2 flex flex-col gap-2 border-t border-brand-primary/10 pt-4">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-28" />
        </div>
      </CardContent>
    </Card>
  );
}