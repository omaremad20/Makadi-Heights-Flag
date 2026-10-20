import { getActiveMeal } from "@/lib/hotels/meal-status";
import { MealCard } from "./meal-card";
import { DiningOption, Hotel } from "@/lib/types";

export function MealSchedule({
  hotel,
  meals,
}: {
  hotel: Hotel;
  meals: DiningOption[];
}) {
  const activeMeal = getActiveMeal(meals, hotel.timezone);

  return (
    <section
      id="dining"
      aria-labelledby="dining-heading"
      className="flex flex-col gap-4"
    >
      <h2
        id="dining-heading"
        className="font-brand-heading text-2xl text-brand-primary"
      >
        Dining today at main restaurant
      </h2>

      <div
        className="no-scrollbar mx-0 md:-mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-6 pb-2"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {meals.map((meal) => (
          <MealCard
            key={meal.id}
            meal={meal}
            is_active={activeMeal?.id === meal.id}
          />
        ))}
      </div>
    </section>
  );
}
