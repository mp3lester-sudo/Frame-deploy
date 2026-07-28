import type { LetterboxdRow } from "./letterboxd";

/**
 * Alternate import path for Letterboxd users who don't have Pro (Letterboxd's
 * ratings.csv/watched.csv export lives behind Settings -> Data, which is a
 * Pro-only feature — free accounts never see it). Instead of a file export,
 * this parses the raw page source of the member's own public Diary page
 * (https://letterboxd.com/<username>/diary/), which the member copies out of
 * their own browser via "View Page Source" and pastes in. That sidesteps
 * Letterboxd's Cloudflare bot-protection entirely, since the fetch happens in
 * a real, already-authenticated browser rather than from our server.
 *
 * The Diary page's server-rendered HTML links each entry's film title as
 * `<a href=".../film/<slug>/...">Title</a>` immediately followed by
 * `<a href=".../films/year/YYYY/">YYYY</a>`, and renders the member's rating
 * as literal "★" characters (one per whole star) plus an optional "½" for a
 * half star — not a CSS class, so it survives a page-source paste as plain
 * text. An entry with no rating simply has no star characters nearby.
 *
 * Because this is reverse-engineered from Letterboxd's markup rather than a
 * documented format, it's intentionally conservative: it only trusts the
 * title+year anchor pair as a real diary entry (ignoring all the nav/filter
 * chrome elsewhere on the page), and callers should show the user a preview
 * of what was found before committing anything, in case Letterboxd's markup
 * has since changed.
 */

const TITLE_YEAR_PATTERN =
  /<a\s+href="[^"]*\/film\/[a-z0-9-]+(?:\/\d+)?\/"[^>]*>([^<]+)<\/a>\s*<a\s+href="[^"]*\/films\/year\/(\d{4})\/"[^>]*>/gi;

// A run of full-star glyphs with an optional trailing half-star glyph.
const RATING_PATTERN = /(★+)(½)?/;

// How far past a title+year match to look for its rating before giving up
// (bounded so we never accidentally read the *next* entry's stars).
const RATING_SEARCH_WINDOW = 600;

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lrm;|&rlm;/g, "")
    .replace(/&rsquo;/g, "’")
    .replace(/&lsquo;/g, "‘")
    .replace(/&rdquo;/g, "”")
    .replace(/&ldquo;/g, "“")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&hellip;/g, "…")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .trim();
}

/**
 * Parses one pasted page-source blob into rows. Diary pages are paginated at
 * ~50 entries, so a member with a long history pastes multiple pages one at
 * a time — the caller (the import action) is what's responsible for merging
 * those across calls, same as it merges ratings.csv + watched.csv today.
 */
export function parseLetterboxdDiaryPaste(html: string): LetterboxdRow[] {
  const rows: LetterboxdRow[] = [];
  const matches = [...html.matchAll(TITLE_YEAR_PATTERN)];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const name = decodeHtmlEntities(match[1]);
    if (!name) continue;
    const year = Number(match[2]);

    const searchStart = match.index! + match[0].length;
    const nextMatchStart = matches[i + 1]?.index ?? html.length;
    const searchEnd = Math.min(searchStart + RATING_SEARCH_WINDOW, nextMatchStart);
    const ratingMatch = html.slice(searchStart, searchEnd).match(RATING_PATTERN);

    const rating = ratingMatch ? ratingMatch[1].length + (ratingMatch[2] ? 0.5 : 0) : null;

    rows.push({ name, year, rating });
  }

  return rows;
}
