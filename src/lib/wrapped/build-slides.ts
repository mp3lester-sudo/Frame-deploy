/**
 * Turns a single WrappedResult into an ordered sequence of story slides --
 * pure logic, no rendering, same split as taste-dna/wrapped.ts's own
 * scoring. WrappedStory (components/wrapped/wrapped-story.tsx) is the only
 * consumer; kept separate so the "what slides exist, in what order, for
 * what data" decision is unit-testable without mounting any React.
 *
 * Every slide type beyond "intro" and "finale" is conditional on the
 * underlying WrappedResult field actually being present -- a title that
 * only ever watches one director's films, for instance, still shouldn't
 * get a hollow "hidden gem" slide with nothing behind it. This mirrors
 * the same conditional-rendering the old plain-grid WrappedRecap already
 * did (see git history), just restructured as a list instead of JSX.
 */
import type { WrappedResult } from "@/lib/taste-dna/wrapped";

export type WrappedSlide =
  | { type: "intro"; headline: string }
  | { type: "totalFilms"; count: number }
  | { type: "totalHours"; hours: number }
  | { type: "topGenres"; genres: { genre: string; count: number }[] }
  | { type: "topDirector"; name: string; count: number }
  | { type: "archetype"; name: string; percent: number }
  | { type: "favoriteTitle"; title: NonNullable<WrappedResult["favoriteTitle"]> }
  | { type: "hiddenGem"; title: NonNullable<WrappedResult["hiddenGem"]> }
  | { type: "finale"; headline: string; summary: string; result: WrappedResult };

export function buildWrappedSlides(result: WrappedResult, headline: string): WrappedSlide[] {
  const slides: WrappedSlide[] = [{ type: "intro", headline }];

  if (result.totalRated > 0) slides.push({ type: "totalFilms", count: result.totalRated });
  if (result.totalHours > 0) slides.push({ type: "totalHours", hours: result.totalHours });
  if (result.topGenres.length > 0) slides.push({ type: "topGenres", genres: result.topGenres });
  if (result.topDirector) {
    slides.push({ type: "topDirector", name: result.topDirector.name, count: result.topDirector.count });
  }
  if (result.topArchetype) {
    slides.push({ type: "archetype", name: result.topArchetype.name, percent: result.topArchetype.percent });
  }
  if (result.favoriteTitle) slides.push({ type: "favoriteTitle", title: result.favoriteTitle });
  if (result.hiddenGem) slides.push({ type: "hiddenGem", title: result.hiddenGem });

  slides.push({ type: "finale", headline, summary: result.summary, result });

  return slides;
}

/** Total runtime in hours, split into whole days + remaining hours -- the
 *  totalHours slide reads "3 days, 7 hours" for a big number instead of a
 *  flat triple-digit hour count, which is both more Spotify-Wrapped-y and
 *  more immediately legible. */
export function formatHoursAsDaysAndHours(totalHours: number): { days: number; hours: number } {
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return { days, hours };
}
