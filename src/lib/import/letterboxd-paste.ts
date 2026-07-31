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
 * `<a href=".../film/<slug>/...">Title</a>` inside an `<h2 class="primaryname">`,
 * with the year rendered separately as `<a href=".../films/year/YYYY/">YYYY</a>`
 * inside a sibling `<span class="releasedate">` — not immediately adjacent to
 * the title anchor, so the two are matched independently within a bounded
 * search window rather than as one combined pattern. Renders the member's rating
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

// Matches the title link only — e.g. `<a href=".../film/the-odyssey-2026/">The Odyssey</a>`
// inside the row's `<h2 class="primaryname">`. Diary rows also contain an
// earlier anchor with the same /film/slug/ href wrapping the poster `<img>`
// (class="frame"), but that anchor's content starts with `<img`, not text,
// so `([^<]+)` (which requires real text immediately after the `>`) never
// matches it — only the real title anchor does.
const TITLE_PATTERN = /<a\s+href="[^"]*\/film\/[a-z0-9-]+(?:\/\d+)?\/"[^>]*>([^<]+)<\/a>/gi;

// The year is NOT adjacent to the title anchor — Letterboxd renders it as
// `<span class="releasedate"><a href=".../films/year/YYYY/">YYYY</a></span>`,
// a sibling of the `<h2>` the title anchor lives in, separated by a closing
// `</h2>` and the opening `<span>` tag. So this only needs to match the
// year *href fragment* somewhere within the search window after the title,
// not immediately after it.
const YEAR_PATTERN = /\/films\/year\/(\d{4})\//;

// A run of full-star glyphs with an optional trailing half-star glyph.
const RATING_PATTERN = /(★+)(½)?/;

// How far past a title match to look for its year/rating before giving up
// (bounded so we never accidentally read the *next* entry's data, or a
// stray /films/year/ link from the page's decade-filter sidebar).
const SEARCH_WINDOW = 600;

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
  const matches = [...html.matchAll(TITLE_PATTERN)];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const name = decodeHtmlEntities(match[1]);
    if (!name) continue;

    const searchStart = match.index! + match[0].length;
    const nextMatchStart = matches[i + 1]?.index ?? html.length;
    const window = html.slice(searchStart, Math.min(searchStart + SEARCH_WINDOW, nextMatchStart));

    const yearMatch = window.match(YEAR_PATTERN);
    if (!yearMatch) continue; // no year found nearby — not confident this is a real diary entry

    const ratingMatch = window.match(RATING_PATTERN);
    const rating = ratingMatch ? ratingMatch[1].length + (ratingMatch[2] ? 0.5 : 0) : null;

    rows.push({ name, year: Number(yearMatch[1]), rating });
  }

  return rows;
}
