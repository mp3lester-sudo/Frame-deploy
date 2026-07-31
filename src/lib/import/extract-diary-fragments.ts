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

// Identical to letterboxd-paste.ts's TITLE_PATTERN/YEAR_PATTERN — the title
// anchor and the year anchor are siblings in different elements
// (`<h2 class="primaryname">` vs `<span class="releasedate">`), not
// adjacent, so they're matched independently within a bounded window.
const TITLE_PATTERN = /<a\s+href="[^"]*\/film\/[a-z0-9-]+(?:\/\d+)?\/"[^>]*>([^<]+)<\/a>/gi;
const YEAR_PATTERN = /\/films\/year\/(\d{4})\//;

// Identical to letterboxd-paste.ts's RATING_PATTERN — the rating is a
// hidden 0-10 range input's value attribute, not literal star glyphs.
const RATING_PATTERN = /class="rateit-field[^"]*"\s+type="range"\s+min="0"\s+max="10"\s+step="1"\s+value="(\d+)"/;

// How far past a title match to look for its year/rating before giving up —
// identical to letterboxd-paste.ts's SEARCH_WINDOW.
const SEARCH_WINDOW = 600;

/**
 * Pulls every "title anchor + year anchor + nearby rating" fragment out of
 * one page's HTML, discarding everything else. Safe to run on multiple
 * pages and join the results — each fragment is self-contained, so page
 * boundaries never matter to the consumer.
 */
export function extractDiaryFragments(html: string): string[] {
  const fragments: string[] = [];
  const matches = [...html.matchAll(TITLE_PATTERN)];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const searchStart = match.index! + match[0].length;
    const nextMatchStart = matches[i + 1]?.index ?? html.length;
    const window = html.slice(searchStart, Math.min(searchStart + SEARCH_WINDOW, nextMatchStart));

    const yearMatch = window.match(YEAR_PATTERN);
    if (!yearMatch) continue; // no year found nearby — not confident this is a real diary entry

    const ratingMatch = window.match(RATING_PATTERN);

    // Keep the year as a bare href fragment (not a full anchor tag) — the
    // parser's YEAR_PATTERN only needs to find that substring, and this
    // keeps fragments minimal.
    fragments.push(match[0] + " " + yearMatch[0] + " " + (ratingMatch ? ratingMatch[0] : ""));
  }

  return fragments;
}

/** Runs extractDiaryFragments over several pages' HTML and joins the
 *  result into the single blob importLetterboxdPaste expects. */
export function extractDiaryFragmentsFromPages(pages: string[]): string {
  return pages.flatMap(extractDiaryFragments).join("\n");
}
