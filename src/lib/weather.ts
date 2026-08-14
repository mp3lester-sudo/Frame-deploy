import { cache } from "react";

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

// Weather sits directly in the home page's blocking data-fetch path (see
// src/app/page.tsx) -- it's a nice-to-have card, not something worth
// making every single home page load wait on indefinitely. fetch() has no
// default timeout of its own; without one, a slow or unreachable
// Open-Meteo would hang for however long the platform's own function
// timeout allows, which is a much worse failure mode than just... not
// showing the weather card for a few seconds.
const WEATHER_FETCH_TIMEOUT_MS = 2000;

// Wrapped in React's cache() (request-scoped memoization) because the home
// page now calls this from two independent places -- the ContextCards
// weather badge and the recommendation engine's weather/time weighting --
// each streamed in its own Suspense boundary (see page.tsx). Without this,
// splitting those into separate components would mean two real Open-Meteo
// round trips per page load for the exact same lat/lon; cache() collapses
// concurrent/duplicate calls with identical args into a single underlying
// fetch, scoped to this one request only (it does not persist across
// requests -- the fetch()-level `next: { revalidate: 600 }` below is what
// handles that).
export const getCurrentWeather = cache(async function getCurrentWeather(latitude: number, longitude: number): Promise<CurrentWeather | null> {
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("longitude", String(longitude));
    url.searchParams.set("current", "temperature_2m,weather_code");
    url.searchParams.set("temperature_unit", "fahrenheit");

    const res = await fetch(url, {
      next: { revalidate: 600 }, // conditions don't need to be fetched more than every ~10 min
      signal: AbortSignal.timeout(WEATHER_FETCH_TIMEOUT_MS),
    });
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
});
