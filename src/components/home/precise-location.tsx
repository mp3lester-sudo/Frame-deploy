"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PRECISE_GEO_COOKIE } from "@/lib/geo-cookie";

const MAX_AGE_SECONDS = 24 * 60 * 60; // matches PRECISE_GEO_MAX_AGE_MS in geo.ts

/**
 * Renders nothing — this is purely a "run once on mount" hook for upgrading
 * location accuracy. Vercel's IP-based geolocation can only ever resolve to
 * whatever city an IP's geo-database entry says, which for residential ISPs
 * is often a nearby city, not the visitor's actual one. The browser's own
 * Geolocation API is dramatically more precise (GPS/WiFi-based rather than
 * IP-block-based) but requires an explicit permission prompt and only runs
 * client-side — hence this component: ask once, reverse-geocode the result,
 * stash it in a cookie the server can read on the next request, then nudge
 * a refresh so this visit benefits too.
 *
 * If the cookie's already fresh, or the user denies/lacks geolocation, this
 * does nothing and the page just keeps using the IP-based estimate — never
 * blocks rendering, never re-prompts every page load.
 */
export function PreciseLocation() {
  const router = useRouter();

  useEffect(() => {
    if (getCookie(PRECISE_GEO_COOKIE)) return; // already fresh (or set this session) — geo.ts handles staleness server-side
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        let city: string | null = null;
        let region: string | null = null;
        try {
          // BigDataCloud's client-side reverse geocode endpoint: free, no API
          // key, CORS-enabled for browser use — same "no signup needed"
          // tier as Open-Meteo's weather API elsewhere in this app.
          const res = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
          );
          if (res.ok) {
            const data = await res.json();
            city = data?.city || data?.locality || null;
            region = data?.principalSubdivisionCode?.split("-")[1] ?? data?.principalSubdivision ?? null;
          }
        } catch {
          // Reverse geocoding request itself failed (network hiccup, etc.)
        }

        if (!city) {
          // Don't cache a coords-only result: geo.ts would silently fall
          // back to the IP-based city name with no visible sign anything's
          // wrong, and *this* cookie's mere presence would block retrying
          // for 24h. Better to leave nothing cached and just try again next
          // visit than to lock in a half-successful result.
          return;
        }

        setCookie(PRECISE_GEO_COOKIE, JSON.stringify({ city, region, latitude, longitude, ts: Date.now() }), MAX_AGE_SECONDS);
        router.refresh();
      },
      () => {
        // Permission denied, or position unavailable — fine, IP-based
        // location remains the fallback.
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: MAX_AGE_SECONDS * 1000 }
    );
  }, [router]);

  return null;
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string, maxAgeSeconds: number) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
}
