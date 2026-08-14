import { XMLParser } from "fast-xml-parser";
import { getArticleImage } from "@/lib/news/article-image";

/**
 * Industry headlines -- live RSS pull merged from four public trade feeds
 * (IndieWire, Variety, Deadline, The Hollywood Reporter), none of which
 * need an API key, unlike a dedicated news API (NewsAPI, etc.) which this
 * project has no credential for. Same fetch-per-request + Next.js
 * data-cache pattern as tmdb-releases.ts and lib/external/tmdb-reviews.ts
 * -- no DB storage, this is a rolling window of recent headlines, not
 * archival data.
 */
export interface IndieNewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  imageUrl: string | null;
}

interface RssItem {
  title?: unknown;
  link?: unknown;
  pubDate?: unknown;
  "media:thumbnail"?: { "@_url"?: unknown } | Array<{ "@_url"?: unknown }>;
}

const FEED_SOURCES: { url: string; source: string }[] = [
  { url: "https://www.indiewire.com/feed/", source: "IndieWire" },
  { url: "https://variety.com/feed/", source: "Variety" },
  { url: "https://deadline.com/feed/", source: "Deadline" },
  { url: "https://www.hollywoodreporter.com/c/movies/feed/", source: "The Hollywood Reporter" },
];

// Every story IndieSpotlight renders gets a real, article-specific photo
// -- either the feed's own embedded thumbnail (Variety/Deadline) or a
// best-effort og:image scrape of the article's own page (IndieWire/THR,
// whose feeds carry no image data at all). Capping the default limit
// (rather than the enrichment) keeps the worst-case number of extra
// per-article fetches on a cold cache bounded and predictable.

function textOf(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object" && "#text" in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>)["#text"] ?? "").trim();
  }
  return String(value).trim();
}

function extractThumbnail(item: RssItem): string | null {
  const raw = item["media:thumbnail"];
  const first = Array.isArray(raw) ? raw[0] : raw;
  const url = first?.["@_url"];
  return url ? String(url).trim() : null;
}

/**
 * Pure XML->items parser, split out from the fetch below so it's
 * unit-testable against a fixed sample string rather than a live network
 * response. `htmlEntities: true` is required here -- fast-xml-parser only
 * decodes the five predefined XML entities by default and otherwise
 * leaves numeric character references like the curly-quote &#8216;
 * these outlets' titles use untouched, which would surface raw entity
 * codes in the UI without it. `ignoreAttributes: false` is needed to read
 * <media:thumbnail url="..."> (Variety/Deadline embed images this way;
 * IndieWire/THR don't embed any image data in their feeds at all).
 */
export function parseRssFeed(xml: string, source: string, limit = 8): IndieNewsItem[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", htmlEntities: true });
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
      title: textOf(item.title),
      url: textOf(item.link),
      source,
      publishedAt: textOf(item.pubDate),
      imageUrl: extractThumbnail(item),
    }))
    .filter((item) => item.title && item.url)
    .slice(0, limit);
}

async function fetchFeed(url: string, source: string): Promise<IndieNewsItem[]> {
  try {
    const res = await fetch(url, {
      // A real User-Agent -- some publishers block the default fetch
      // signature on server-to-server requests.
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MarqueeBot/1.0; +https://taste-green-tau.vercel.app)" },
      next: { revalidate: 3600 },
      // Without this, a slow/unresponsive outlet has no upper bound at all
      // -- getArticleImage already caps its own fetch at 6s (see
      // article-image.ts) but this one, the feed fetch itself, never had a
      // matching timeout. One hung trade-press feed could stall this
      // Promise.allSettled call far longer than any of the caches around it
      // expect, which (before the home page section below was moved behind
      // its own Suspense boundary) meant a single slow outlet could hold up
      // the entire home page.
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRssFeed(xml, source);
  } catch {
    return [];
  }
}

function byRecency(a: IndieNewsItem, b: IndieNewsItem): number {
  const at = new Date(a.publishedAt).getTime();
  const bt = new Date(b.publishedAt).getTime();
  // Push unparsable dates to the end rather than letting NaN comparisons
  // scramble the sort order.
  return (Number.isFinite(bt) ? bt : 0) - (Number.isFinite(at) ? at : 0);
}

/**
 * Fetches all four trade feeds in parallel via allSettled so one outlet
 * being down or rate-limiting us doesn't take out the others, merges by
 * recency, then best-effort backfills a thumbnail (via og:image scraping)
 * for the handful of top stories that get featured visual treatment and
 * didn't already carry a media:thumbnail from their own feed.
 */
export async function getIndieNews(limit = 8): Promise<IndieNewsItem[]> {
  const results = await Promise.allSettled(FEED_SOURCES.map(({ url, source }) => fetchFeed(url, source)));

  const merged = results
    .filter((r): r is PromiseFulfilledResult<IndieNewsItem[]> => r.status === "fulfilled")
    .flatMap((r) => r.value)
    .sort(byRecency)
    .slice(0, limit);

  const enriched = await Promise.all(
    merged.map(async (item) => {
      if (item.imageUrl) return item;
      const imageUrl = await getArticleImage(item.url);
      return imageUrl ? { ...item, imageUrl } : item;
    })
  );

  return enriched;
}
