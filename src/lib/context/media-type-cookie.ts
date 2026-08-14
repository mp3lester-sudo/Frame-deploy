/**
 * Just the cookie name + value type, split out with zero server-only
 * imports -- same reason as geo-cookie.ts: media-type.ts (reads this via
 * next/headers' cookies(), server-only) and the toggle component (a "use
 * client" component that writes it from the browser) both need this name,
 * but importing it from media-type.ts directly would pull next/headers
 * into the client bundle.
 */
export const MEDIA_TYPE_COOKIE = "marquee_media_type";

export type MediaType = "movie" | "tv";

export const DEFAULT_MEDIA_TYPE: MediaType = "movie";

export function isMediaType(value: string | undefined | null): value is MediaType {
  return value === "movie" || value === "tv";
}
