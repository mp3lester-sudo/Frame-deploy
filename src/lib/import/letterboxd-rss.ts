import type { LetterboxdRow } from "./letterboxd";
import { decodeHtmlEntities } from "./letterboxd-paste";

/**
 * Import path that needs nothing but a username -- no CSV export, no
 * saving/pasting a page. Every Letterboxd profile (free or Pro, public by
 * default) publishes an RSS feed at letterboxd.com/<username>/rss/, and
 * unlike the Diary/Films HTML pages (which Cloudflare bot-challenges any
 * server-side request to -- confirmed by hand before building this), the
 * RSS endpoint answers server-side fetches cleanly with no challenge. RSS
 * readers are the entire point of the endpoint, so this isn't circumventing
 * anything the HTML pages' bot-protection is there to stop.
 *
 * The real limitation: the feed only carries a member's ~50-76 most recent
 * diary/review entries, with no pagination. That makes this a fast way to
 * grab someone's recent activity, but not a substitute for the CSV or
 * paste-HTML paths for someone's full watch history -- all three stay
 * available side by side (see settings/page.tsx).
 *
 * The upside beyond speed: each entry carries a `tmdb:movieId`, a real
 * TMDB id -- something neither the CSV export nor the scraped HTML pages
 * expose at all. That lets matching skip title+year fuzzy-matching
 * entirely for these rows (see matchAndUpsertRssRows in
 * lib/actions/import.ts) and match directly against titles.tmdb_id,
 * which is both more reliable and immune to the title-formatting
 * mismatches (subtitles, trailing punctuation, re-releases) that cause
 * fuzzy matching to miss.
 */
export interface LetterboxdRssRow extends LetterboxdRow {
  tmdbId: number | null;
}

const ITEM_PATTERN = /<item>([\s\S]*?)<\/item>/g;
const FILM_TITLE_PATTERN = /<letterboxd:filmTitle>([^<]*)<\/letterboxd:filmTitle>/;
const FILM_YEAR_PATTERN = /<letterboxd:filmYear>(\d+)<\/letterboxd:filmYear>/;
const MEMBER_RATING_PATTERN = /<letterboxd:memberRating>([\d.]+)<\/letterboxd:memberRating>/;
const WATCHED_DATE_PATTERN = /<letterboxd:watchedDate>(\d{4}-\d{2}-\d{2})<\/letterboxd:watchedDate>/;
const TMDB_MOVIE_ID_PATTERN = /<tmdb:movieId>(\d+)<\/tmdb:movieId>/;

/**
 * Parses a Letterboxd RSS feed body into rows. The feed mixes diary/review
 * entries (which have a `letterboxd:filmTitle`) with list entries (which
 * don't) -- only the former are film log entries, so items missing
 * filmTitle are skipped rather than misread as a film called "Movies with
 * Video Game Bad Endings" or similar.
 */
export function parseLetterboxdRss(xml: string): LetterboxdRssRow[] {
  const rows: LetterboxdRssRow[] = [];

  for (const itemMatch of xml.matchAll(ITEM_PATTERN)) {
    const item = itemMatch[1];
    const titleMatch = item.match(FILM_TITLE_PATTERN);
    if (!titleMatch) continue; // a list/review-only entry, not a film log

    const name = decodeHtmlEntities(titleMatch[1]);
    if (!name) continue;

    const yearMatch = item.match(FILM_YEAR_PATTERN);
    const ratingMatch = item.match(MEMBER_RATING_PATTERN);
    const watchedMatch = item.match(WATCHED_DATE_PATTERN);
    const tmdbMatch = item.match(TMDB_MOVIE_ID_PATTERN);

    rows.push({
      name,
      year: yearMatch ? Number(yearMatch[1]) : null,
      rating: ratingMatch ? Number(ratingMatch[1]) : null,
      watchedAt: watchedMatch ? watchedMatch[1] : null,
      tmdbId: tmdbMatch ? Number(tmdbMatch[1]) : null,
    });
  }

  return rows;
}
