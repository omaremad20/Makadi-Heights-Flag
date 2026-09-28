import { getCurrentTimeInZone, toMinutes } from "../helpers";
import { DiningOption } from "../types";

/**
 * Finds the meal period that is currently open, comparing "HH:mm" strings
 * as minutes-since-midnight. Returns undefined when nothing is open.
 */
export function getActiveMeal(
  meals: DiningOption[],
  timezone: string,
  now = new Date()
): DiningOption | undefined {
  const currentMinutes = toMinutes(getCurrentTimeInZone(timezone, now));
  return meals.find((meal) => {
    const start = toMinutes(meal.start_time);
    const end = toMinutes(meal.end_time);
    return currentMinutes >= start && currentMinutes < end;
  });
}