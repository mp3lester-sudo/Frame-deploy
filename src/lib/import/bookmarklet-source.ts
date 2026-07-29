/**
 * Source for the "one-click diary import" bookmarklet — the easiest path
 * for Letterboxd members without Pro (whose account has no CSV export
 * option under Settings -> Data) to get their whole diary into Frame.
 *
 * The manual fallback (letterboxd-paste.ts) already works by having a
 * member "View Page Source" their Diary and paste it in, but Diary pages
 * only show ~50 entries per page, so a long history means doing that once
 * per page by hand. This automates exactly that: it runs in the member's
 * own already-signed-in browser tab (so it's a normal same-origin fetch,
 * not a server-to-server request our backend could ever make), follows
 * Letterboxd's own /page/N/ pagination convention page by page, and pulls
 * out only the title+year+rating fragments the existing parser needs —
 * not full page HTML, so even a multi-thousand-entry diary stays well
 * under the 3MB paste limit (src/lib/actions/import.ts's MAX_PASTE_CHARS).
 *
 * Output is deliberately shaped to match exactly what
 * parseLetterboxdDiaryPaste (letterboxd-paste.ts) already expects — the
 * same title+year anchor pair followed by star-glyph rating within its
 * search window — so no backend or parser changes were needed to ship
 * this; it's a drop-in producer for an already-working consumer.
 *
 * Deliberately has no `//` line comments in the executable body: the
 * component that turns this into a `javascript:` URI collapses all
 * whitespace (including newlines) to single spaces, which would silently
 * turn a line comment into one that swallows the rest of the script.
 */
export const LETTERBOXD_DIARY_BOOKMARKLET_SOURCE = `
(async () => {
  var TITLE_YEAR_RE = /<a\\s+href="[^"]*\\/film\\/[a-z0-9-]+(?:\\/\\d+)?\\/"[^>]*>([^<]+)<\\/a>\\s*<a\\s+href="[^"]*\\/films\\/year\\/(\\d{4})\\/"[^>]*>/gi;
  var RATING_RE = /(★+)(½)?/;
  var RATING_WINDOW = 600;
  var MAX_PAGES = 400;

  function extractFragments(html) {
    var out = [];
    var matches = Array.from(html.matchAll(TITLE_YEAR_RE));
    for (var i = 0; i < matches.length; i++) {
      var m = matches[i];
      var start = m.index + m[0].length;
      var end = Math.min(start + RATING_WINDOW, i + 1 < matches.length ? matches[i + 1].index : html.length);
      var ratingMatch = html.slice(start, end).match(RATING_RE);
      out.push(m[0] + ' ' + (ratingMatch ? ratingMatch[0] : ''));
    }
    return out;
  }

  if (!/(^|\\.)letterboxd\\.com$/.test(location.hostname)) {
    alert('Open your Letterboxd diary page first (signed in), then click this bookmarklet.');
    return;
  }

  var baseUrl = location.href.split('?')[0].replace(/\\/page\\/\\d+\\/?$/, '/');
  if (baseUrl.slice(-1) !== '/') baseUrl += '/';

  var page = 1;
  var prevHtml = null;
  var fragments = [];

  while (page <= MAX_PAGES) {
    var url = page === 1 ? baseUrl : baseUrl + 'page/' + page + '/';
    var res;
    try {
      res = await fetch(url, { credentials: 'same-origin' });
    } catch (e) {
      break;
    }
    if (!res.ok) break;
    var html = await res.text();
    if (prevHtml !== null && html === prevHtml) break;
    var found = extractFragments(html);
    if (found.length === 0) break;
    fragments = fragments.concat(found);
    prevHtml = html;
    page++;
    await new Promise(function (r) { setTimeout(r, 350); });
  }

  if (fragments.length === 0) {
    alert("No diary entries found. Make sure you're on your own Letterboxd diary page (e.g. letterboxd.com/your-username/films/diary/) while signed in.");
    return;
  }

  var blob = fragments.join('\\n');
  var pageCount = page - 1;

  try {
    await navigator.clipboard.writeText(blob);
    alert('Copied ' + fragments.length + ' diary entries (from ' + pageCount + ' page' + (pageCount === 1 ? '' : 's') + ') to your clipboard. Now go back to Frame and paste it into the import box.');
  } catch (e) {
    window.prompt('Clipboard copy failed. Select all the text below (Ctrl/Cmd+A), copy it (Ctrl/Cmd+C), then paste it into Frame\\'s import box:', blob);
  }
})();
`;
