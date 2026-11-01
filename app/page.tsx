export const dynamic = "force-dynamic";

import { AquaParkSection } from "@/components/home/aqua-park-section";
import { HomeHashScroll } from "@/components/home/home-hash-scroll";
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
import { AQUAPARK, BEACH_ACCESS_METHODS, DINING, SERENITY } from "@/lib/config/hotel";
import { getCurrentMenu } from "@/lib/services/settings/menu.service";
import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Makadi Heights — Serenity ",
  description:
    "Sea conditions, dining hours, and location for Serenity at Makadi Heights.",
};

export default async function Page() {
  // Hotel content is static config; only the current menu PDF is read from site_settings.
  const hotel = SERENITY;
  const menu = await getCurrentMenu();

  return (
    <main className="mx-auto flex min-h-full w-[95%] sm:w-[90%] flex-col gap-10 py-10">
      <HomeHashScroll />
      <div className="space-y-2">
        <p className="text-lg font-semibold text-[#2D6867]">
          Dear Valued Client,
        </p>

        <p className="text-sm leading-5 text-gray-600">
          Warm greetings from Makadi Heights Community Management! We&apos;re delighted to
          welcome you and share the following information to enhance your experience.
        </p>
      </div>
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
        <BeachAccessSection beach_access_methods={BEACH_ACCESS_METHODS} />
      </Suspense>

      <Suspense fallback={<AquaParkSectionSkeleton />}>
        <AquaParkSection aquapark={AQUAPARK} />
      </Suspense>

      <Suspense fallback={<MealScheduleSkeleton />}>
        <MealSchedule meals={DINING} hotel={hotel} />
      </Suspense>

      <Suspense fallback={<MenuBtnSkeleton />}>
        <MenuButton href={menu.url} />
      </Suspense>

      <Suspense fallback={<MapSkeleton />}>
        <LocationCard hotel={hotel} />
      </Suspense>
    </main>
  );
}
