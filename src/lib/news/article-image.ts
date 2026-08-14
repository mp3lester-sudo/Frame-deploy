// IndieWire's RSS feed itself doesn't include any image data (see
// indie-news.test.ts's SAMPLE_RSS, copied from a real live fetch -- no
// <enclosure>/<media:content>/<content:encoded>, just title/link/date), so
// pulling a genuine thumbnail means fetching the actual article page and
// reading its Open Graph preview image, the same tag every article already
// publishes for link previews on social media. This is the only honest way
// to show a real thumbnail rather than inventing or guessing one.

const OG_IMAGE_PATTERNS = [
  /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
];

/**
 * Best-effort: any failure (timeout, no og:image tag, the site blocking a
 * server-to-server fetch) just means no thumbnail for that story, not a
 * broken card -- same "omit rather than fake it" spirit as the rest of the
 * Daily page.
 */
export async function getArticleImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MarqueeBot/1.0; +https://taste-green-tau.vercel.app)" },
      next: { revalidate: 3600 },
      // Several of these can run concurrently (one per trade article on the
      // home page) -- cap each at a few seconds so one slow/unresponsive
      // outlet can't stall the whole batch.
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;

    const html = await res.text();
    for (const pattern of OG_IMAGE_PATTERNS) {
      const match = html.match(pattern);
      if (match?.[1]) return match[1];
    }
    return null;
  } catch {
    return null;
  }
}
