import { Card, CardContent } from "../ui/card";
import { Skeleton } from "../ui/skeleton";

export default function MapSkeleton() {
  return (
    <Card id="serenity-location" className="overflow-hidden py-0! h-[50vh] border-brand-primary/15">
      <CardContent className="h-full p-0">
        <Skeleton className="h-full w-full rounded-none" />
      </CardContent>
    </Card>
  );
}
