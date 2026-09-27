import type { MealPeriod } from "@/lib/hotels/hotels";

/**
 * Returns "HH:mm" for right now, in the given IANA timezone, using Intl
 * (no date library needed).
 */
export function getCurrentTimeInZone(timezone: string, now = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return formatter.format(now);
}

function toMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Finds the meal period that is currently open, comparing "HH:mm" strings
 * as minutes-since-midnight. Returns undefined when nothing is open.
 */
export function getActiveMeal(
  meals: MealPeriod[],
  timezone: string,
  now = new Date()
): MealPeriod | undefined {
  const currentMinutes = toMinutes(getCurrentTimeInZone(timezone, now));
  return meals.find((meal) => {
    const start = toMinutes(meal.startTime);
    const end = toMinutes(meal.endTime);
    return currentMinutes >= start && currentMinutes < end;
  });
}

/** Formats "HH:mm" as a friendly "7:00 AM" style string. */
export function formatMealTime(hhmm: string): string {
  const [hours, minutes] = hhmm.split(":").map(Number);
  const reference = new Date(Date.UTC(2000, 0, 1, hours, minutes));
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: minutes === 0 ? undefined : "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(reference);
}