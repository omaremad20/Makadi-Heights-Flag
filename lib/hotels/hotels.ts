// PLACEHOLDER DATA: meal times are invented per the brief and structured so
// they can be swapped for real database/API values later without touching

import { Hotel } from "../types";

// any component.
export const HOTELS: Record<string, Hotel> = {
  serenity: {
    slug: "serenity",
    name: "Serenity",
    property: "Makadi Heights",
    coordinates: { latitude: 26.971766961154067, longitude: 33.9185992892854 },
    timezone: "Africa/Cairo",
  },
};

export function getHotel(slug: string): Hotel | undefined {
  return HOTELS[slug];
}
