import { XMLParser } from "fast-xml-parser";

/**
 * "Indie Buzz" headlines -- live RSS pull from IndieWire ("The Voice of
 * Creative Independence"), a public feed that needs no API key, unlike a
 * dedicated news API (NewsAPI, etc.) which this project has no credential
 * for. Same fetch-per-request + Next.js data-cache pattern as
 * tmdb-releases.ts and lib/external/tmdb-reviews.ts -- no DB storage,
 * this is a rolling window of recent headlines, not archival data.
 */
export interface IndieNewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
}

interface RssItem {
  title?: unknown;
  link?: unknown;
  pubDate?: unknown;
}

/**
 * Pure XML->items parser, split out from the fetch below so it's
 * unit-testable against a fixed sample string rather than a live network
 * response. `htmlEntities: true` is required here -- fast-xml-parser only
 * decodes the five predefined XML entities by default and otherwise
 * leaves numeric character references like the curly-quote &#8216;
 * IndieWire's own titles use untouched, which would surface raw entity
 * codes in the UI without it.
 */
export function parseRssFeed(xml: string, source: string, limit = 8): IndieNewsItem[] {
  const parser = new XMLParser({ ignoreAttributes: true, htmlEntities: true });
  let data: { rss?: { channel?: { item?: RssItem | RssItem[] } } };
  try {
    data = parser.parse(xml);
  } catch {
    return [];
  }

  const rawItems = data?.rss?.channel?.item;
  const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

  return items
    .map((item) => ({
      title: String(item.title ?? "").trim(),
      url: String(item.link ?? "").trim(),
      source,
      publishedAt: String(item.pubDate ?? ""),
    }))
    .filter((item) => item.title && item.url)
    .slice(0, limit);
}

export async function getIndieNews(limit = 8): Promise<IndieNewsItem[]> {
  try {
    const res = await fetch("https://www.indiewire.com/feed/", {
      // A real User-Agent -- some publishers block the default fetch
      // signature on server-to-server requests.
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BacklotBot/1.0; +https://taste-green-tau.vercel.app)" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRssFeed(xml, "IndieWire", limit);
  } catch {
    return [];
  }
}
