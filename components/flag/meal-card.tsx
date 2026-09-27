import { MealPeriod } from "@/lib/hotels/hotels";
import { formatMealTime } from "@/lib/hotels/meal-status";

export function MealCard({
  meal,
  isActive,
}: {
  meal: MealPeriod;
  isActive: boolean;
}) {
  return (
    <article className="flex w-64 shrink-0 snap-start flex-col gap-3 rounded-2xl border border-brand-primary/15 bg-white px-5 py-5 shadow-[0_1px_3px_rgba(45,104,103,0.08)]">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-brand-heading text-lg text-brand-primary">
          {meal.name}
        </h3>
        {isActive ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-brand-secondary">
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.25)] motion-safe:animate-pulse"
            />
            <span role="status">Open now</span>
          </span>
        ) : (
          <span className="text-xs font-medium text-brand-secondary/60">
            Closed
          </span>
        )}
      </div>

      <p className="font-brand-body text-sm text-brand-secondary">
        {formatMealTime(meal.startTime)} – {formatMealTime(meal.endTime)}
      </p>

      <p className="font-brand-body text-sm leading-relaxed text-brand-primary/80">
        {meal.price}
      </p>
    </article>
  );
}
