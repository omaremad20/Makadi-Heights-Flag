export type MealPeriod = {
  id: string;
  name: string;
  /** 24h "HH:mm", in the hotel's local timezone */
  startTime: string;
  endTime: string;
  description: string;
  price: string;
};

export type Hotel = {
  slug: string;
  name: string;
  property: string;
  coordinates: { latitude: number; longitude: number };
  /** IANA timezone, used for meal availability + map/marine display */
  timezone: string;
  meals: MealPeriod[];
  menuHref: string;
};

// PLACEHOLDER DATA: meal times are invented per the brief and structured so
// they can be swapped for real database/API values later without touching
// any component.
export const HOTELS: Record<string, Hotel> = {
  serenity: {
    slug: "serenity",
    name: "Serenity",
    property: "Makadi Heights",
    coordinates: { latitude: 26.971766961154067, longitude: 33.9185992892854 },
    timezone: "Africa/Cairo",
    meals: [
      {
        id: "breakfast",
        name: "Breakfast",
        startTime: "07:00",
        endTime: "9:30",
        description: "Fresh pastries, eggs to order, and seasonal fruit.",
        price: "300-400 EGP",
      },
      {
        id: "lunch",
        name: "Lunch",
        startTime: "12:30",
        endTime: "14:30",
        description: "Mediterranean grill and a rotating regional buffet.",
        price: "450 EGP",
      },
      {
        id: "dinner",
        name: "Dinner",
        startTime: "19:00",
        endTime: "21:30",
        description: "A relaxed, multi-course evening by the water.",
        price: "500-650EGP - 40EURO",
      },
    ],
    menuHref:
      "https://qnyhugdkhackdrnufxno.supabase.co/storage/v1/object/public/menu/Menu_Serenity_2026.pdf",
  },
};

export function getHotel(slug: string): Hotel | undefined {
  return HOTELS[slug];
}
