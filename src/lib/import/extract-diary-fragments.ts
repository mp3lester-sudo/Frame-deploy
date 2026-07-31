/**
 * Client-side pre-shrink for Letterboxd imports (both the file-drop and
 * manual-paste paths in letterboxd-paste-import.tsx). A saved "Complete
 * Webpage" or a full page-source paste carries the whole document — nav
 * chrome, inline scripts/styles, analytics — often several hundred KB to a
 * few MB per page, most of which parseLetterboxdDiaryPaste (the server-side
 * parser) throws away anyway since it only ever looks for a title+year pair
 * and a nearby rating.
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
 * Handles both page types letterboxd-paste.ts's parser understands (Diary
 * and Films/Films>Ratings) — see that file's header comment for the real
 * markup each is based on. Output is deliberately in the exact shape
 * parseLetterboxdDiaryPaste already expects — see letterboxd-paste.test.ts's
 * fixtures and __tests__/extract-diary-fragments.test.ts, which feeds this
 * function's output back through the real server-side parser to confirm
 * they agree on every case.
 */

// --- Diary page — identical to letterboxd-paste.ts's DIARY_* patterns.
const DIARY_TITLE_PATTERN = /<a\s+href="[^"]*\/film\/[a-z0-9-]+(?:\/\d+)?\/"[^>]*>([^<]+)<\/a>/gi;
const DIARY_YEAR_PATTERN = /\/films\/year\/(\d{4})\//;
const DIARY_RATING_PATTERN = /class="rateit-field[^"]*"\s+type="range"\s+min="0"\s+max="10"\s+step="1"\s+value="(\d+)"/;
const DIARY_SEARCH_WINDOW = 600;

// --- Films/Films>Ratings grid page — identical to letterboxd-paste.ts's
// FILMS_GRID_* patterns.
const FILMS_GRID_NAME_PATTERN = /data-item-name="([^"]+)"/g;
const FILMS_GRID_RATING_PATTERN = /rated-(\d+)/;
const FILMS_GRID_SEARCH_WINDOW = 2500;

function extractDiaryFragmentsOnly(html: string): string[] {
  const fragments: string[] = [];
  const matches = [...html.matchAll(DIARY_TITLE_PATTERN)];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const searchStart = match.index! + match[0].length;
    const nextMatchStart = matches[i + 1]?.index ?? html.length;
    const window = html.slice(searchStart, Math.min(searchStart + DIARY_SEARCH_WINDOW, nextMatchStart));

    const yearMatch = window.match(DIARY_YEAR_PATTERN);
    if (!yearMatch) continue; // no year found nearby — not confident this is a real diary entry

    const ratingMatch = window.match(DIARY_RATING_PATTERN);

    // Keep the year as a bare href fragment (not a full anchor tag) — the
    // parser's YEAR_PATTERN only needs to find that substring, and this
    // keeps fragments minimal.
    fragments.push(match[0] + " " + yearMatch[0] + " " + (ratingMatch ? ratingMatch[0] : ""));
  }

  return fragments;
}

function extractFilmsGridFragmentsOnly(html: string): string[] {
  const fragments: string[] = [];
  const matches = [...html.matchAll(FILMS_GRID_NAME_PATTERN)];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const searchStart = match.index! + match[0].length;
    const nextMatchStart = matches[i + 1]?.index ?? html.length;
    const window = html.slice(searchStart, Math.min(searchStart + FILMS_GRID_SEARCH_WINDOW, nextMatchStart));

    const ratingMatch = window.match(FILMS_GRID_RATING_PATTERN);

    // match[0] here is the bare `data-item-name="Title (YYYY)"` attribute —
    // already minimal, no separate title/year fragments needed like the
    // diary case.
    fragments.push(match[0] + " " + (ratingMatch ? ratingMatch[0] : ""));
  }

  return fragments;
}

/**
 * Pulls every real entry's fragment out of one page's HTML (Diary rows,
 * Films-grid items, or both if the blob happens to contain both page
 * types), discarding everything else. Safe to run on multiple pages and
 * join the results — each fragment is self-contained, so page boundaries
 * never matter to the consumer.
 */
export function extractDiaryFragments(html: string): string[] {
  return [...extractDiaryFragmentsOnly(html), ...extractFilmsGridFragmentsOnly(html)];
}

/** Runs extractDiaryFragments over several pages' HTML and joins the
 *  result into the single blob importLetterboxdPaste expects. */
export function extractDiaryFragmentsFromPages(pages: string[]): string {
  return pages.flatMap(extractDiaryFragments).join("\n");
}
