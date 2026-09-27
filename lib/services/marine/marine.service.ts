export type MarineConditions = {
  seaSurfaceTemperatureC: number;
  waveHeightM: number | null;
  observedAt: string;
};

export type MarineResult =
  | { status: "success"; data: MarineConditions }
  | { status: "unavailable" }
  | { status: "error" };

type OpenMeteoMarineResponse = {
  current?: {
    time?: string;
    sea_surface_temperature?: number | null;
    wave_height?: number | null;
  };
};

const MARINE_API_URL = "https://marine-api.open-meteo.com/v1/marine";

/**
 * Fetches current sea conditions for a fixed set of coordinates from the
 * Open-Meteo Marine API (no API key required). Never throws — callers get
 * a discriminated result so the UI can render loading/empty/error states
 * without try/catch scattered through components.
 */
export async function getMarineConditions(
  latitude: number,
  longitude: number,
  timezone: string
): Promise<MarineResult> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "sea_surface_temperature,wave_height",
    timezone,
  });

  try {
    const response = await fetch(`${MARINE_API_URL}?${params.toString()}`, {
      // Sea temperature changes slowly — refresh at most every 30 minutes
      // so the page isn't re-fetching on every request.
      next: { revalidate: 1800 },
    });

    if (!response.ok) {
      return { status: "error" };
    }

    const payload = (await response.json()) as OpenMeteoMarineResponse;
    const temperature = payload.current?.sea_surface_temperature;

    if (typeof temperature !== "number" || Number.isNaN(temperature)) {
      return { status: "unavailable" };
    }

    return {
      status: "success",
      data: {
        seaSurfaceTemperatureC: temperature,
        waveHeightM:
          typeof payload.current?.wave_height === "number"
            ? payload.current.wave_height
            : null,
        observedAt: payload.current?.time ?? new Date().toISOString(),
      },
    };
  } catch {
    return { status: "error" };
  }
}