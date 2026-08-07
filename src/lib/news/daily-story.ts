import { getIndieNews, type IndieNewsItem } from "./indie-news";
import { getArticleImage } from "./article-image";

export interface DailyNewsStory extends IndieNewsItem {
  /** Real Open Graph image from the article's own page -- see
   *  article-image.ts for why this can't come from the RSS feed itself.
   *  null when the article has no og:image or the fetch failed. */
  imageUrl: string | null;
}

// Wide enough pool that the daily pick has real variety day to day without
// reaching into stale week-old headlines.
const POOL_SIZE = 20;

/**
 * Deterministically picks ONE real headline per calendar day from the same
 * live IndieWire RSS pull IndieSpotlight already uses (see indie-news.ts) --
 * a genuine, sourced story with a real link, not AI-generated or invented
 * "news." Seeded by date so every visitor sees the same pick today, and it
 * moves to a different real headline once the date changes. The specific
 * pick can shift slightly within a day as the underlying feed itself
 * updates (same 1h cache window as the rest of Indie Spotlight) -- that's
 * expected and fine for something framed as live news.
 */
export async function getDailyNewsStory(): Promise<DailyNewsStory | null> {
  const items = await getIndieNews(POOL_SIZE);
  if (!items.length) return null;

  const dateKey = new Date().toISOString().slice(0, 10);
  const seed = [...dateKey].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const picked = items[seed % items.length];

  const imageUrl = await getArticleImage(picked.url);
  return { ...picked, imageUrl };
}
