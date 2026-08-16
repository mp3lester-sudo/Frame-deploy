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
 * entries, with no pagination. That makes this a fast way to grab someone's
 * recent activity, but not a substitute for the CSV or paste-HTML paths for
 * someone's full watch history -- all three stay available side by side
 * (see settings/page.tsx).
 *
 * By design this only imports entries that carry a written review --
 * plain diary logs (watched + optionally starred, no review text) are
 * skipped. Letterboxd's feed doesn't expose a reviews-only endpoint (their
 * one RSS URL mixes diary logs, reviews, and lists together), and every
 * entry's <description> always opens with the poster <img>, so a review is
 * detected by checking whether anything meaningful survives once that
 * poster paragraph -- and, for unreviewed logs, the boilerplate "Watched on
 * <date>." sentence Letterboxd inserts in its place -- is stripped out.
 * Confirmed by hand against a real feed: reviewed entries carry review
 * prose (sometimes behind a numeric "review score" <b> tag first),
 * unreviewed diary entries carry only that one sentence.
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
const DESCRIPTION_PATTERN = /<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/;

// Every item's description opens with the poster image in its own <p>,
// review or not -- strip it before checking for actual review content.
const POSTER_PARAGRAPH = /^\s*<p>\s*<img[^>]*\/?>\s*<\/p>\s*/i;
// What Letterboxd inserts in place of review text on a plain diary log
// (watched, maybe rated, never reviewed): a single "Watched on <date>."
// sentence and nothing else.
const WATCHED_ON_ONLY = /^<p>\s*Watched on [^<]*\.\s*<\/p>\s*$/i;

/**
 * True if a feed item's raw <description> CDATA contains an actual written
 * review, as opposed to a plain diary log entry (watched, optionally
 * starred, no review text).
 */
export function hasWrittenReview(descriptionHtml: string | undefined): boolean {
  if (!descriptionHtml) return false;
  const afterPoster = descriptionHtml.replace(POSTER_PARAGRAPH, "").trim();
  if (afterPoster.length === 0) return false;
  if (WATCHED_ON_ONLY.test(afterPoster)) return false;
  return true;
}

/**
 * Parses a Letterboxd RSS feed body into rows -- reviews only. The feed
 * mixes diary logs, reviews, and lists together (all as <item>s); list
 * entries lack a `letterboxd:filmTitle` and are skipped outright, and
 * plain diary logs (a `letterboxd:filmTitle` but no written review) are
 * filtered out via hasWrittenReview above so only films the member
 * actually wrote about come through.
 */
export function parseLetterboxdRss(xml: string): LetterboxdRssRow[] {
  const rows: LetterboxdRssRow[] = [];

  for (const itemMatch of xml.matchAll(ITEM_PATTERN)) {
    const item = itemMatch[1];
    const titleMatch = item.match(FILM_TITLE_PATTERN);
    if (!titleMatch) continue; // a list entry, not a film log

    const name = decodeHtmlEntities(titleMatch[1]);
    if (!name) continue;

    const descriptionMatch = item.match(DESCRIPTION_PATTERN);
    if (!hasWrittenReview(descriptionMatch?.[1])) continue; // diary log, no review

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
