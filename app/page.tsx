export const dynamic = "force-dynamic";

import { AquaParkSection } from "@/components/home/aqua-park-section";
import { BeachAccessSection } from "@/components/home/beach-access-section";
import { LocationCard } from "@/components/home/location-card";
import { MealSchedule } from "@/components/home/meal-schedule";
import { MenuButton } from "@/components/home/menu-button";
import { SeaConditionsCard } from "@/components/home/sea-conditions-card";
import { AquaParkSectionSkeleton } from "@/components/skeletons/aqua-park-section-skeleton";
import { BeachAccessSectionSkeleton } from "@/components/skeletons/beach-access-section-skeleton";
import MapSkeleton from "@/components/skeletons/map-skeleton";
import MealScheduleSkeleton from "@/components/skeletons/meal-schedule-skeleton";
import MenuBtnSkeleton from "@/components/skeletons/menu-btn-skeleton";
import SeaConditionsCardSkeleton from "@/components/skeletons/sea-conditions-card-skeleton";
import { getHotel } from "@/lib/hotels/hotels";
import { fetchHotelData } from "@/lib/services/hotel/hotel.service";
import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Makadi Heights — Serenity ",
  description:
    "Sea conditions, dining hours, and location for Serenity at Makadi Heights.",
};

export default async function Page() {
  // Single hotel for now; swap for a param/lookup once more hotels exist.
  const hotel = getHotel("serenity");
  const { status, data } = await fetchHotelData();

  if (status === "error" || !hotel || !data) {
    throw new Error("Failed to fetch data");
  }

  return (
    <main className="mx-auto flex min-h-full w-[95%] sm:w-[90%] flex-col gap-10 py-10">
      <div className="grid">
        <Suspense fallback={<SeaConditionsCardSkeleton />}>
          <SeaConditionsCard
            latitude={hotel.coordinates.latitude}
            longitude={hotel.coordinates.longitude}
            timezone={hotel.timezone}
          />
        </Suspense>
      </div>

      <Suspense fallback={<BeachAccessSectionSkeleton />}>
        <BeachAccessSection beach_access_methods={data.beach_access_methods} />
      </Suspense>

      <Suspense fallback={<AquaParkSectionSkeleton />}>
        <AquaParkSection aquapark={data.aquapark} />
      </Suspense>

      <Suspense fallback={<MealScheduleSkeleton />}>
        <MealSchedule meals={data.dining} hotel={hotel} />
      </Suspense>

      <Suspense fallback={<MenuBtnSkeleton />}>
        <MenuButton href={data.menu_link} />
      </Suspense>

      <Suspense fallback={<MapSkeleton />}>
        <LocationCard hotel={hotel} />
      </Suspense>
    </main>
  );
}
