import { headers } from "next/headers";

/**
 * Vercel's edge network sets these headers on every request in production —
 * no API key, no client-side geolocation prompt needed. They're absent in
 * local dev / non-Vercel environments, in which case callers should treat
 * geo as unavailable rather than guessing a default.
 * https://vercel.com/docs/edge-network/headers#request-headers
 */
export interface RequestGeo {
  city: string | null;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
}

export async function getRequestGeo(): Promise<RequestGeo | null> {
  const h = await headers();

  const city = h.get("x-vercel-ip-city");
  const region = h.get("x-vercel-ip-country-region");
  const latitude = h.get("x-vercel-ip-latitude");
  const longitude = h.get("x-vercel-ip-longitude");
  const timezone = h.get("x-vercel-ip-timezone");

  if (!latitude && !longitude && !city) return null;

  return {
    city: city ? decodeURIComponent(city) : null,
    region,
    latitude: latitude ? Number(latitude) : null,
    longitude: longitude ? Number(longitude) : null,
    timezone,
  };
}
