import { headers, cookies } from "next/headers";
import { PRECISE_GEO_COOKIE } from "@/lib/geo-cookie";

/**
 * Vercel's edge network sets these headers on every request in production —
 * no API key, no client-side geolocation prompt needed. They're absent in
 * local dev / non-Vercel environments, in which case callers should treat
 * geo as unavailable rather than guessing a default.
 * https://vercel.com/docs/edge-network/headers#request-headers
 *
 * The catch: IP geolocation only resolves to whatever city the IP's
 * geolocation database associates with that ISP node/exchange point, which
 * for residential ISPs is very often a *nearby* larger city, not the
 * visitor's actual city — e.g. Sammamish, WA resolving to Federal Way, WA.
 * Precise city-level accuracy from an IP address alone isn't fixable; the
 * only real fix is the browser's own Geolocation API (GPS/WiFi-based, far
 * more precise), which requires an explicit permission prompt and only runs
 * client-side. See components/home/precise-location.tsx: it asks for that
 * permission, reverse-geocodes the coordinates, and stores the result in
 * the PRECISE_GEO_COOKIE below — which this function then prefers over the
 * IP-based headers whenever it's present and fresh. Anyone who declines
 * (or hasn't loaded that component yet) just keeps the IP-based estimate,
 * same as before.
 */
const PRECISE_GEO_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h — location doesn't need to be re-derived every visit

export interface RequestGeo {
  city: string | null;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
}

interface PreciseGeoCookie {
  city: string | null;
  region: string | null;
  latitude: number;
  longitude: number;
  ts: number;
}

export async function getRequestGeo(): Promise<RequestGeo | null> {
  const h = await headers();

  const city = h.get("x-vercel-ip-city");
  const region = h.get("x-vercel-ip-country-region");
  const latitude = h.get("x-vercel-ip-latitude");
  const longitude = h.get("x-vercel-ip-longitude");
  const timezone = h.get("x-vercel-ip-timezone");

  const ipGeo: RequestGeo | null =
    !latitude && !longitude && !city
      ? null
      : {
          city: city ? decodeURIComponent(city) : null,
          region,
          latitude: latitude ? Number(latitude) : null,
          longitude: longitude ? Number(longitude) : null,
          timezone,
        };

  const precise = await getPreciseGeoFromCookie();
  if (!precise) return ipGeo;

  // Browser geolocation doesn't know the IANA timezone name the way Vercel's
  // edge headers do — keep that piece from the IP-based lookup (timezone is
  // regional, not precise-location-sensitive, so the IP estimate is fine for
  // it) and take everything else from the precise, permission-granted source.
  return {
    city: precise.city ?? ipGeo?.city ?? null,
    region: precise.region ?? ipGeo?.region ?? null,
    latitude: precise.latitude,
    longitude: precise.longitude,
    timezone: ipGeo?.timezone ?? null,
  };
}

async function getPreciseGeoFromCookie(): Promise<PreciseGeoCookie | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(PRECISE_GEO_COOKIE)?.value;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as PreciseGeoCookie;
    if (typeof parsed.latitude !== "number" || typeof parsed.longitude !== "number") return null;
    if (Date.now() - parsed.ts > PRECISE_GEO_MAX_AGE_MS) return null; // stale — let the client component refresh it
    return parsed;
  } catch {
    return null;
  }
}
