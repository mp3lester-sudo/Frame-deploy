/**
 * Client-side pre-shrink for Letterboxd diary imports (both the file-drop
 * and manual-paste paths in letterboxd-paste-import.tsx). A saved "Complete
 * Webpage" or a full page-source paste carries the whole document — nav
 * chrome, inline scripts/styles, analytics — often several hundred KB to a
 * few MB per page, most of which parseLetterboxdDiaryPaste (the server-side
 * parser) throws away anyway since it only ever looks for the title+year
 * anchor pair and a nearby star rating.
 *
 * This runs the identical extraction in the browser before the Server
 * Action call, so only those small fragments (a few hundred bytes per
 * film) ever leave the browser. Two reasons that matters, not just one:
 *   1. Next.js Server Actions have a body size cap (default 1MB) — a
 *      multi-page drop of raw saved HTML can blow past that and fail with
 *      an opaque, digest-only "Server Components render" error that gives
 *      no hint it was a size problem (see next.config.ts, which also bumps
 *      the cap as a backstop).
 *   2. Even under the cap, there's no reason to ship megabytes of markup
 *      the parser was always going to discard.
 *
 * Output is deliberately in the exact shape parseLetterboxdDiaryPaste
 * already expects (a title+year anchor immediately followed, within its
 * search window, by star glyphs) — see letterboxd-paste.test.ts's fixtures
 * and __tests__/extract-diary-fragments.test.ts, which feeds this
 * function's output back through the real server-side parser to confirm
 * they agree on every case.
 */

const TITLE_YEAR_PATTERN =
  /<a\s+href="[^"]*\/film\/[a-z0-9-]+(?:\/\d+)?\/"[^>]*>([^<]+)<\/a>\s*<a\s+href="[^"]*\/films\/year\/(\d{4})\/"[^>]*>/gi;

// A run of full-star glyphs with an optional trailing half-star glyph —
// identical to letterboxd-paste.ts's RATING_PATTERN.
const RATING_PATTERN = /(★+)(½)?/;

// How far past a title+year match to look for its rating before giving up —
// identical to letterboxd-paste.ts's RATING_SEARCH_WINDOW.
const RATING_SEARCH_WINDOW = 600;

/**
 * Pulls every "title anchor + year anchor + nearby rating" fragment out of
 * one page's HTML, discarding everything else. Safe to run on multiple
 * pages and join the results — each fragment is self-contained, so page
 * boundaries never matter to the consumer.
 */
export function extractDiaryFragments(html: string): string[] {
  const fragments: string[] = [];
  const matches = [...html.matchAll(TITLE_YEAR_PATTERN)];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const searchStart = match.index! + match[0].length;
    const nextMatchStart = matches[i + 1]?.index ?? html.length;
    const searchEnd = Math.min(searchStart + RATING_SEARCH_WINDOW, nextMatchStart);
    const ratingMatch = html.slice(searchStart, searchEnd).match(RATING_PATTERN);

    fragments.push(match[0] + " " + (ratingMatch ? ratingMatch[0] : ""));
  }

  return fragments;
}

/** Runs extractDiaryFragments over several pages' HTML and joins the
 *  result into the single blob importLetterboxdPaste expects. */
export function extractDiaryFragmentsFromPages(pages: string[]): string {
  return pages.flatMap(extractDiaryFragments).join("\n");
}
