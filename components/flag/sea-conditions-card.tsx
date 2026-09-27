export const dynamic = "force-dynamic";
// ASSUMPTION: shadcn "card" and "skeleton" components are already installed
// at @/components/ui/card and @/components/ui/skeleton. Run
// `npx shadcn@latest add card skeleton` if not.
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getMarineConditions } from "@/lib/services/marine/marine.service";
import { SeaFlagRealtime } from "./sea-flag-realtime";
import { getSeaFlag } from "@/lib/services/sea/sea.service";
import { getHotel } from "@/lib/hotels/hotels";

function formatTemperature(celsius: number): string {
  return `${Math.round(celsius * 10) / 10}°C`;
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <Card className="border-brand-primary/15 bg-brand-primary/5">
      <CardContent className="flex flex-col gap-1 px-6 py-3 -mt-2">
        {children}
      </CardContent>
    </Card>
  );
}

export async function SeaConditionsCard({
  latitude,
  longitude,
  timezone,
}: {
  latitude: number;
  longitude: number;
  timezone: string;
}) {
  // Independent data sources — one failing must never take the other down.
  // Both services already catch internally and resolve rather than throw,
  // so Promise.all is safe here (nothing to reject).
  const [marineResult, seaFlagResult] = await Promise.all([
    getMarineConditions(latitude, longitude, timezone),
    getSeaFlag(),
  ]);
  const hotel = getHotel("serenity");

  return (
    <Wrapper>
      {marineResult.status === "error" ||
      marineResult.status === "unavailable" ? (
        <>
          <h1 className="font-brand-heading text-3xl leading-tight -ms-2 mb-3 font-semibold text-brand-primary sm:text-4xl">
            {hotel!.name + " Alpha"}
          </h1>

          <p className="font-brand-body text-brand-primary/80">
            Sea conditions aren&apos;t available right now. Please check back
            shortly.
          </p>
        </>
      ) : (
        <>
          <h1 className="font-brand-heading text-3xl leading-tight -ms-2 mb-3 font-semibold text-brand-primary sm:text-4xl">
            {hotel!.name + " Alpha"}
          </h1>

          <p className="font-brand-heading text-5xl text-brand-primary">
            {formatTemperature(marineResult.data.seaSurfaceTemperatureC)}
          </p>
          <p className="font-brand-body text-sm text-brand-secondary/80">
            Current sea surface temperature
            {marineResult.data.waveHeightM !== null &&
              ` · ${marineResult.data.waveHeightM.toFixed(1)}m waves`}
          </p>
        </>
      )}

      <div className="mt-4 border-t border-brand-primary/10 pt-4">
        {seaFlagResult.status === "success" ? (
          <SeaFlagRealtime initialSea={seaFlagResult.data} />
        ) : (
          <div className="flex flex-col gap-1">
            <p className="font-brand-body text-sm text-brand-secondary">
              Sea flag
            </p>
            <p className="font-brand-body text-sm text-brand-secondary/60">
              Sea flag unavailable
            </p>
          </div>
        )}
      </div>
    </Wrapper>
  );
}

export function SeaConditionsCardSkeleton() {
  return (
    <Card className="border-brand-primary/15 bg-brand-primary/5">
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
