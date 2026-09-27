import { Hotel } from "@/lib/hotels/hotels";
import { getActiveMeal } from "@/lib/hotels/meal-status";
import { MealCard } from "./meal-card";

export function MealSchedule({ hotel }: { hotel: Hotel }) {
  const activeMeal = getActiveMeal(hotel.meals, hotel.timezone);

  return (
    <section aria-labelledby="dining-heading" className="flex flex-col gap-4">
      <h2
        id="dining-heading"
        className="font-brand-heading text-2xl text-brand-primary"
      >
        Dining today
      </h2>

      <div
        className="no-scrollbar mx-0 md:-mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-6 pb-2"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {hotel.meals.map((meal) => (
          <MealCard
            key={meal.id}
            meal={meal}
            isActive={activeMeal?.id === meal.id}
          />
        ))}
      </div>
    </section>
  );
}
