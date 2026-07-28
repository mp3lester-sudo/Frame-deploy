/**
 * Open-Meteo (open-meteo.com) — free, no API key, no rate-limit signup
 * required. Fetches current conditions for a lat/lon (from Vercel's request
 * geolocation, see src/lib/geo.ts) so the home page can show real weather
 * instead of the old hardcoded "46°F · Rain" demo value.
 */

// WMO weather interpretation codes, as used by Open-Meteo's `weather_code`.
// https://open-meteo.com/en/docs#weathervariables
const WEATHER_CODE_LABELS: Record<number, string> = {
  0: "Clear",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Rain showers",
  81: "Rain showers",
  82: "Heavy showers",
  85: "Snow showers",
  86: "Snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm",
  99: "Thunderstorm",
};

export interface CurrentWeather {
  tempF: number;
  description: string;
  code: number;
}

export async function getCurrentWeather(latitude: number, longitude: number): Promise<CurrentWeather | null> {
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("longitude", String(longitude));
    url.searchParams.set("current", "temperature_2m,weather_code");
    url.searchParams.set("temperature_unit", "fahrenheit");

    const res = await fetch(url, { next: { revalidate: 600 } }); // conditions don't need to be fetched more than every ~10 min
    if (!res.ok) return null;

    const data = await res.json();
    const tempF = data?.current?.temperature_2m;
    const code = data?.current?.weather_code;
    if (typeof tempF !== "number" || typeof code !== "number") return null;

    return { tempF: Math.round(tempF), description: WEATHER_CODE_LABELS[code] ?? "—", code };
  } catch {
    // Weather is a nice-to-have on the home page, not a critical path —
    // fail quietly and let the caller just omit the card.
    return null;
  }
}
