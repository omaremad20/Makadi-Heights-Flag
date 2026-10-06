import type { Profile } from "./types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DISPLAY_TIME_ZONE = "Africa/Cairo"; // change if your team works elsewhere

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function getDisplayName(
  profile: Pick<Profile, "full_name" | "email">,
): string {
  return profile.full_name?.trim() || profile.email;
}

export function getInitials(
  profile: Pick<Profile, "full_name" | "email">,
): string {
  const name = profile.full_name?.trim();
  if (name) {
    const parts = name.split(/\s+/);
    const initials =
      (parts[0]?.[0] ?? "") +
      (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "");
    return initials.toUpperCase() || "?";
  }
  return (profile.email[0] ?? "?").toUpperCase();
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: DISPLAY_TIME_ZONE,
  }).format(new Date(iso));
}
