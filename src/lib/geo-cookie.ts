/**
 * Just the cookie name, split out into its own file with zero server-only
 * imports. geo.ts (which reads this cookie via next/headers' cookies(), a
 * server-only API) and precise-location.tsx (a "use client" component that
 * writes this cookie from the browser) both need this same name — but
 * precise-location.tsx importing it directly from geo.ts was pulling
 * next/headers into the client bundle, which Next.js rejects outright and
 * was the actual cause of the 500s on every page.
 */
export const PRECISE_GEO_COOKIE = "slate_geo";
