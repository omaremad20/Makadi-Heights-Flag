import { MakadiHeghitsLogo } from "@/components/flag/makadi-heights-logo";
import { LocationCard } from "@/components/flag/location-card";
import { MealSchedule } from "@/components/flag/meal-schedule";
import { MenuButton } from "@/components/flag/menu-button";
import { AquaParkSection } from "@/components/home/aqua-park-section";
import { BeachAccessSection } from "@/components/home/beach-access-section";
import { Footer } from "@/components/shared/footer";
import {
  SeaConditionsCard,
  SeaConditionsCardSkeleton,
} from "@/components/flag/sea-conditions-card";
import { getHotel } from "@/lib/hotels/hotels";
import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Makadi Heights — Serenity ",
  description:
    "Sea conditions, dining hours, and location for Serenity at Makadi Heights.",
};

export default function Page() {
  // Single hotel for now; swap for a param/lookup once more hotels exist.
  const hotel = getHotel("serenity");

  if (!hotel) {
    return (
      <main className="flex min-h-full items-center justify-center px-4 py-16">
        <p className="font-brand-body text-brand-secondary">
          This property isn&apos;t available right now.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-full w-[95%] flex-col gap-10 py-5">
      <MakadiHeghitsLogo />

      <div className="grid">
        <Suspense fallback={<SeaConditionsCardSkeleton />}>
          <SeaConditionsCard
            latitude={hotel.coordinates.latitude}
            longitude={hotel.coordinates.longitude}
            timezone={hotel.timezone}
          />
        </Suspense>
      </div>
      <BeachAccessSection />
      <AquaParkSection />

      <MealSchedule hotel={hotel} />
      <MenuButton href={hotel.menuHref} />
      <Suspense fallback={<SeaConditionsCardSkeleton />}>
        <LocationCard hotel={hotel} />
      </Suspense>
      <Footer />
    </main>
  );
}
