import { AquaParkSectionSkeleton } from "@/components/skeletons/aqua-park-section-skeleton";
import { BeachAccessSectionSkeleton } from "@/components/skeletons/beach-access-section-skeleton";
import MapSkeleton from "@/components/skeletons/map-skeleton";
import MealScheduleSkeleton from "@/components/skeletons/meal-schedule-skeleton";
import MenuBtnSkeleton from "@/components/skeletons/menu-btn-skeleton";
import SeaConditionsCardSkeleton from "@/components/skeletons/sea-conditions-card-skeleton";

export default function Loading() {
  return (
    <>
      <div className="grid">
        <SeaConditionsCardSkeleton />
      </div>

      <AquaParkSectionSkeleton />

      <BeachAccessSectionSkeleton />

      <MealScheduleSkeleton />

      <MenuBtnSkeleton />

      <MapSkeleton />
    </>
  );
}
