import { cookies } from "next/headers";
import { MEDIA_TYPE_COOKIE, DEFAULT_MEDIA_TYPE, isMediaType, type MediaType } from "./media-type-cookie";

/**
 * The single source of truth for "is this request in Movies mode or Shows
 * mode" -- every server-rendered page/action that queries `titles` should
 * call this once and thread the result through as a media_type filter,
 * the same way engine.ts already threads `context`/`weather` through.
 *
 * Defaults to "movie" (not undefined/null) so every caller can filter
 * unconditionally rather than branching on "no preference set yet" --
 * matches the pre-toggle behavior for anyone who hasn't touched the
 * toggle, since the catalogue was movie-only until Shows shipped.
 */
export async function getActiveMediaType(): Promise<MediaType> {
  const store = await cookies();
  const raw = store.get(MEDIA_TYPE_COOKIE)?.value;
  return isMediaType(raw) ? raw : DEFAULT_MEDIA_TYPE;
}
