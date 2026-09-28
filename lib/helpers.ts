/** Formats "HH:mm" as a friendly "7:00 AM" style string. */
export function formatTime(hhmm: string): string {
  const [hours, minutes] = hhmm.split(":").map(Number);
  const reference = new Date(Date.UTC(2000, 0, 1, hours, minutes));
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: minutes === 0 ? undefined : "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(reference);
}

/**
 * Returns "HH:mm" for right now, in the given IANA timezone, using Intl
 * (no date library needed).
 */
export function getCurrentTimeInZone(
  timezone: string,
  now = new Date(),
): string {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return formatter.format(now);
}

export function toMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
}

export function formatLastUpdated(updatedAt: string): string {
  const updatedDate = new Date(updatedAt);
  const now = new Date();

  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );

  const startOfUpdatedDay = new Date(
    updatedDate.getFullYear(),
    updatedDate.getMonth(),
    updatedDate.getDate(),
  );

  const diffInDays = Math.floor(
    (startOfToday.getTime() - startOfUpdatedDay.getTime()) /
      (1000 * 60 * 60 * 24),
  );

  const time = updatedDate.toLocaleString("en-EG", {
    hour: "numeric",
    minute: "2-digit",
  });

  if (diffInDays === 0) {
    return `Today at ${time}`;
  }

  if (diffInDays === 1) {
    return `Yesterday at ${time}`;
  }

  if (diffInDays < 30) {
    return `${diffInDays} days ago at ${time}`;
  }

  return `${updatedDate.toLocaleString("en-EG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })} at ${time}`;
}
