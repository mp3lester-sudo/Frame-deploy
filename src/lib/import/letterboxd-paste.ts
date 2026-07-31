import type { LetterboxdRow } from "./letterboxd";

/**
 * Alternate import path for Letterboxd users who don't have Pro (Letterboxd's
 * ratings.csv/watched.csv export lives behind Settings -> Data, which is a
 * Pro-only feature — free accounts never see it). Instead of a file export,
 * this parses the raw page source of one of the member's own public pages,
 * which the member copies out of their own browser via "View Page Source"
 * (or Save Page As) and pastes/drops in. That sidesteps Letterboxd's
 * Cloudflare bot-protection entirely, since the fetch happens in a real,
 * already-authenticated browser rather than from our server.
 *
 * Two page types are supported, auto-detected within the same blob so a
 * user can drop either (or a mix) into the same box:
 *
 * 1. Diary (https://letterboxd.com/<username>/diary/) — dated log entries
 *    only. Title lives in `<a href=".../film/<slug>/...">Title</a>` inside
 *    an `<h2 class="primaryname">`, with the year rendered separately as
 *    `<a href=".../films/year/YYYY/">YYYY</a>` inside a sibling
 *    `<span class="releasedate">` — not immediately adjacent to the title
 *    anchor, so the two are matched independently within a bounded search
 *    window. The rating is a hidden 0-10 range input
 *    (`<input class="rateit-field ..." type="range" min="0" max="10"
 *    step="1" value="N">`), not literal star glyphs.
 *
 * 2. Films / Films > Ratings (https://letterboxd.com/<username>/films/) —
 *    every film ever marked watched or rated, regardless of whether it has
 *    a diary date. This is the only way for a free account to recover
 *    ratings on films that were never logged to the diary (a very common
 *    gap: years of ratings from before someone started using the diary
 *    feature). Each poster is a `<div ... data-item-name="Title (YYYY)">`
 *    (title and year combined — split on the trailing " (YYYY)"), with the
 *    rating in a nearby `<span class="rating ... rated-N">` (same 0-10
 *    scale as the diary's range input; absent entirely for an unrated
 *    watch).
 *
 * Because this is reverse-engineered from Letterboxd's markup rather than a
 * documented format, it's intentionally conservative: it only trusts a
 * title+year pair as a real entry (ignoring all the nav/filter chrome
 * elsewhere on the page), and callers should show the user a preview of
 * what was found before committing anything, in case Letterboxd's markup
 * has since changed.
 */

// --- Diary page ---

// Matches the title link only — e.g. `<a href=".../film/the-odyssey-2026/">The Odyssey</a>`
// inside the row's `<h2 class="primaryname">`. Diary rows also contain an
// earlier anchor with the same /film/slug/ href wrapping the poster `<img>`
// (class="frame"), but that anchor's content starts with `<img`, not text,
// so `([^<]+)` (which requires real text immediately after the `>`) never
// matches it — only the real title anchor does.
const DIARY_TITLE_PATTERN = /<a\s+href="[^"]*\/film\/[a-z0-9-]+(?:\/\d+)?\/"[^>]*>([^<]+)<\/a>/gi;

const DIARY_YEAR_PATTERN = /\/films\/year\/(\d{4})\//;
const DIARY_RATING_PATTERN = /class="rateit-field[^"]*"\s+type="range"\s+min="0"\s+max="10"\s+step="1"\s+value="(\d+)"/;

// How far past a title match to look for its year/rating before giving up
// (bounded so we never accidentally read the *next* entry's data, or a
// stray /films/year/ link from the page's decade-filter sidebar).
const DIARY_SEARCH_WINDOW = 600;

// --- Films / Films > Ratings grid page ---

const FILMS_GRID_NAME_PATTERN = /data-item-name="([^"]+)"/g;
// Trailing " (YYYY)" at the very end of the string. Titles can legitimately
// contain their own parentheses (e.g. "Birdman or (The Unexpected Virtue of
// Ignorance)") — greedy `.*` plus the end-anchor means this still isolates
// the *last* parenthesized group (the year Letterboxd always appends) even
// when the title has its own.
const FILMS_GRID_NAME_YEAR_PATTERN = /^(.*) \((\d{4})\)$/;
const FILMS_GRID_RATING_PATTERN = /rated-(\d+)/;
// The rating span sits well after the poster's full attribute list and
// image tag — measured up to ~1.4k chars past data-item-name on a real
// saved Films page, so this needs a bigger window than the diary's.
const FILMS_GRID_SEARCH_WINDOW = 2500;

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

function ratingFromScale10(raw: string | undefined): number | null {
  const value = raw ? Number(raw) : 0;
  return value > 0 ? value / 2 : null;
}

function parseDiaryRows(html: string): LetterboxdRow[] {
  const rows: LetterboxdRow[] = [];
  const matches = [...html.matchAll(DIARY_TITLE_PATTERN)];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const name = decodeHtmlEntities(match[1]);
    if (!name) continue;

    const searchStart = match.index! + match[0].length;
    const nextMatchStart = matches[i + 1]?.index ?? html.length;
    const window = html.slice(searchStart, Math.min(searchStart + DIARY_SEARCH_WINDOW, nextMatchStart));

    const yearMatch = window.match(DIARY_YEAR_PATTERN);
    if (!yearMatch) continue; // no year found nearby — not confident this is a real diary entry

    const ratingMatch = window.match(DIARY_RATING_PATTERN);
    rows.push({ name, year: Number(yearMatch[1]), rating: ratingFromScale10(ratingMatch?.[1]) });
  }

  return rows;
}

function parseFilmsGridRows(html: string): LetterboxdRow[] {
  const rows: LetterboxdRow[] = [];
  const matches = [...html.matchAll(FILMS_GRID_NAME_PATTERN)];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const nameYear = decodeHtmlEntities(match[1]);
    const parsed = nameYear.match(FILMS_GRID_NAME_YEAR_PATTERN);
    if (!parsed) continue; // no trailing (YYYY) — not confident this is a real film item
    const name = parsed[1].trim();
    if (!name) continue;

    const searchStart = match.index! + match[0].length;
    const nextMatchStart = matches[i + 1]?.index ?? html.length;
    const window = html.slice(searchStart, Math.min(searchStart + FILMS_GRID_SEARCH_WINDOW, nextMatchStart));

    const ratingMatch = window.match(FILMS_GRID_RATING_PATTERN);
    rows.push({ name, year: Number(parsed[2]), rating: ratingFromScale10(ratingMatch?.[1]) });
  }

  return rows;
}

/**
 * Parses one pasted page-source blob into rows — a Diary page, a Films (or
 * Films > Ratings) page, or a mix of saved pages of either type
 * concatenated together. Both page types paginate (Diary at ~50 entries,
 * Films at ~72-100 depending on view), so a member with a long history
 * pastes multiple pages one at a time — the caller (the import action) is
 * what's responsible for merging those across calls, same as it merges
 * ratings.csv + watched.csv today.
 */
export function parseLetterboxdDiaryPaste(html: string): LetterboxdRow[] {
  return [...parseDiaryRows(html), ...parseFilmsGridRows(html)];
}
