import type { MediaType } from "@/lib/context/media-type-cookie";

/**
 * Movie Night's feature name, UI copy, route (/movie-night), and DB table
 * (movie_nights) were all built before the Movies/Shows toggle existed
 * and never renamed for Shows mode -- a user picking a TV show with
 * friends was still being asked to a "movie night." Renaming the route
 * or DB table now would be a much larger, riskier change for a purely
 * cosmetic problem, so only the user-facing display copy branches on
 * mediaType; the URL, the movie_nights table, and every internal
 * function/variable name stay exactly as they are.
 *
 * "Watch Party" in Shows mode, "Movie Night" in Movies mode (the
 * long-standing default).
 */
export function movieNightLabel(mediaType: MediaType): string {
  return mediaType === "tv" ? "Watch Party" : "Movie Night";
}

export function movieNightLabelLower(mediaType: MediaType): string {
  return mediaType === "tv" ? "watch party" : "movie night";
}

export function movieNightsLabelLower(mediaType: MediaType): string {
  return mediaType === "tv" ? "watch parties" : "movie nights";
}
