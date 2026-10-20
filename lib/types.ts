export interface BeachAccessMethod {
  id: string;
  per: string;
  price: number | null;
  title: string;
  link: string | null;
  description: string;
}

export interface AquaParkSchedule {
  id: "morning" | "break" | "afternoon";
  label: string;
  start_time: string;
  end_time: string;
  is_break?: boolean;
}

export interface AquaPark {
  price: number;
  schedule: AquaParkSchedule[];
}

export interface DiningOption {
  id: "breakfast" | "lunch" | "dinner";
  name: string;
  price: string;
  start_time: string;
  end_time: string;
  description: string;
}

export interface Serenity {
  beach_access_methods: BeachAccessMethod[];
  menu_link: string;
  aquapark: AquaPark;
  dining: DiningOption[];
}

export type Hotel = {
  slug: string;
  name: string;
  property: string;
  coordinates: { latitude: number; longitude: number };
  /** IANA timezone, used for meal availability + map/marine display */
  timezone: string;
};
