/**
 * Static hotel content (moved out of the `hotel` table on 2026-10-31).
 * Snapshot of production hotel row, updated_at 2026-10-21 07:12 UTC,
 * content md5 8820f9781723535becb0eadb23868a72 (checked again by the pending
 * drop_hotel migration before the table is removed).
 *
 * Editing prices/times/descriptions is now a code change + redeploy (approved).
 * Only public information belongs here. The only dynamic value, the current
 * menu PDF, lives in public.site_settings.
 */
import type { AquaPark, BeachAccessMethod, DiningOption, Hotel } from "../types.ts";

export const SERENITY: Hotel = {
  slug: "serenity",
  name: "Serenity",
  property: "Makadi Heights",
  coordinates: { latitude: 26.971766961154067, longitude: 33.9185992892854 },
  timezone: "Africa/Cairo",
};

/** Public URL of a file in the public `menu` bucket (membership PDFs and menus live there). */
export function menuBucketPublicUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/menu/${encodeURIComponent(path)}`;
}

export const BEACH_ACCESS_METHODS: BeachAccessMethod[] = [
  {
    id: "membership",
    per: "Per Week",
    link: menuBucketPublicUrl("BEACH_AND_CLUBHOUSE_2026.pdf"),
    price: null,
    title: "Clubhouse Membership",
    description: "Use your clubhouse membership to access the beach and clubhouse.",
  },
  {
    id: "clubhouse_only_membership",
    per: "Per Week",
    link: menuBucketPublicUrl("CLUBHOUSE_ONLY_2026.pdf"),
    price: null,
    title: "Clubhouse Membership",
    description: "Use your clubhouse membership to access the clubhouse & beach.",
  },
  {
    id: "ticket",
    per: "Per Day",
    link: null,
    price: 600,
    title: "Daily Ticket",
    description: "Pick up a daily beach and clubhouse ticket from the collection office.",
  },
  {
    id: "clubhouse_daily_ticket",
    per: "Per Day",
    link: null,
    price: 450,
    title: "Daily Ticket",
    description: "Pick up a daily clubhouse only ticket from the collection office.",
  },
];

export const AQUAPARK: AquaPark = {
  price: 1000,
  schedule: [
    { id: "morning", label: "Morning session", start_time: "10:00", end_time: "13:00" },
    { id: "break", label: "Break", start_time: "13:00", end_time: "15:00", is_break: true },
    { id: "afternoon", label: "Afternoon session", start_time: "15:00", end_time: "18:00" },
  ],
};

export const DINING: DiningOption[] = [
  {
    id: "breakfast",
    name: "Breakfast",
    price: "300-400 EGP",
    start_time: "07:00",
    end_time: "10:00",
    description: "Fresh pastries, eggs to order, and seasonal fruit.",
  },
  {
    id: "lunch",
    name: "Lunch",
    price: "450 EGP",
    start_time: "12:30",
    end_time: "14:30",
    description: "Mediterranean grill and a rotating regional buffet.",
  },
  {
    id: "dinner",
    name: "Dinner",
    price: "500-650EGP - 40EURO",
    start_time: "18:00",
    end_time: "21:30",
    description: "A relaxed, multi-course evening by the water.",
  },
];

/** Used only if site_settings cannot be read, so the homepage never loses its menu button. */
export const FALLBACK_MENU_PATH = "Menu_Serenity_2026.pdf";
