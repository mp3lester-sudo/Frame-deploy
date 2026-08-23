import Image from "@/components/ui/fade-image";
import type { IndieRelease } from "@/lib/news/tmdb-releases";
import { formatReleaseDate, getIndieReleases } from "@/lib/news/tmdb-releases";
import type { IndieNewsItem } from "@/lib/news/indie-news";
import { getIndieNews } from "@/lib/news/indie-news";

/**
 * Home page "Indie Spotlight" section -- a horizontal strip of new/
 * upcoming releases from indie-leaning distributors (A24, NEON, Magnolia,
 * Searchlight), paired with a trade-press headline block merged live from
 * four outlets (IndieWire, Variety, Deadline, The Hollywood Reporter).
 * Every trade story shown carries its own real, article-specific photo
 * (see indie-news.ts) -- never a generic/stock image -- with a quiet
 * source-branded placeholder only for the rare case a thumbnail truly
 * couldn't be found. Renders nothing if both live fetches came back
 * empty (network hiccup, rate limit, etc.) rather than showing an
 * awkward empty section.
 */
/**
 * Self-fetching async wrapper -- pulled out of the home page's main data
 * Promise.all (see src/app/page.tsx) and rendered inside its own
 * <Suspense> boundary instead. This section is the least time-sensitive
 * thing on the page (four live trade-press RSS feeds plus best-effort
 * og:image scraping for two of them, see indie-news.ts/article-image.ts)
 * and was, before this change, on the SAME critical path as the hero
 * recommendation -- a single slow/rate-limiting outlet held up the entire
 * home page render, hero included, even though nothing about it depends
 * on this section's data. Streaming it in separately means the important,
 * personalized content above it can paint as soon as it's ready,
 * regardless of how the news pipeline performs on any given request.
 */
export async function IndieSpotlightSection() {
  const [releases, news] = await Promise.all([getIndieReleases(), getIndieNews()]);
  return <IndieSpotlight releases={releases} news={news} />;
}

/** Lightweight shimmer shown while IndieSpotlightSection's Suspense
 *  boundary is still resolving -- roughly matches the real section's
 *  shape (poster strip + featured headline block) so there's no layout
 *  jump when the real content streams in. */
export function IndieSpotlightSkeleton() {
  return (
    <section className="mt-8 border-t border-border pt-6">
      <div className="mb-4 h-3 w-32 skeleton rounded" />
      <div className="flex gap-4 overflow-hidden">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="aspect-[2/3] w-[112px] shrink-0 skeleton rounded-[var(--radius-md)] sm:w-[128px]" />
        ))}
      </div>
      <div className="mt-6 aspect-[16/9] w-full skeleton rounded-[var(--radius-md)] sm:aspect-[21/9]" />
    </section>
  );
}

function IndieSpotlight({ releases, news }: { releases: IndieRelease[]; news: IndieNewsItem[] }) {
  if (!releases.length && !news.length) return null;

  const [featured, ...rest] = news;
  const grid = rest.slice(0, 2);
  const list = rest.slice(2);

  return (
    <section className="mt-8 border-t border-border pt-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-[10px] uppercase tracking-wider text-foreground-muted">Indie Spotlight</span>
        <span className="text-[11px] text-foreground-muted">New &amp; upcoming from A24, NEON, Magnolia &amp; Searchlight</span>
      </div>

      {releases.length > 0 && (
        <div className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2">
          {releases.map((r) => (
            <div key={r.tmdbId} className="w-[112px] shrink-0 snap-start sm:w-[128px]">
              <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface-raised">
                {r.posterUrl && <Image src={r.posterUrl} alt={r.title} fill sizes="128px" className="object-cover" />}
                <span
                  className={`absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[9px] uppercase tracking-wide ${
                    r.status === "new" ? "bg-accent/90 text-background" : "bg-background/80 text-foreground-muted"
                  }`}
                >
                  {r.status === "new" ? "New" : "Coming soon"}
                </span>
              </div>
              <p className="mt-1.5 line-clamp-2 text-xs leading-snug text-foreground">{r.title}</p>
              {r.releaseDate && <p className="text-[10px] text-foreground-muted">{formatReleaseDate(r.releaseDate)}</p>}
            </div>
          ))}
        </div>
      )}

      {news.length > 0 && (
        <div className={`${releases.length > 0 ? "mt-6" : ""}`}>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[10px] uppercase tracking-wider text-foreground-muted">The Trades</span>
            <span className="text-[10px] text-foreground-muted">IndieWire · Variety · Deadline · THR</span>
          </div>

          {featured && (
            <a
              href={featured.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative block aspect-[16/9] w-full overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface-raised sm:aspect-[21/9]"
            >
              {featured.imageUrl ? (
                <Image
                  src={featured.imageUrl}
                  alt={featured.title}
                  fill
                  sizes="(min-width: 640px) 640px, 100vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
              ) : (
                <NewsPlaceholder source={featured.source} />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-3.5 sm:p-4">
                <SourceBadge source={featured.source} />
                <p className="mt-1.5 line-clamp-2 text-sm font-medium leading-snug text-foreground sm:text-base">
                  {featured.title}
                </p>
              </div>
            </a>
          )}

          {grid.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              {grid.map((item, i) => (
                <a
                  key={i}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative block aspect-[4/3] overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface-raised"
                >
                  {item.imageUrl ? (
                    <Image
                      src={item.imageUrl}
                      alt={item.title}
                      fill
                      sizes="(min-width: 640px) 320px, 50vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <NewsPlaceholder source={item.source} size="compact" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-2.5">
                    <SourceBadge source={item.source} small />
                    <p className="mt-1 line-clamp-2 text-xs font-medium leading-snug text-foreground">{item.title}</p>
                  </div>
                </a>
              ))}
            </div>
          )}

          {list.length > 0 && (
            <div className="mt-4 flex flex-col gap-3 border-t border-border pt-3">
              {list.map((item, i) => (
                <a key={i} href={item.url} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-3">
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[var(--radius-sm)] border border-border bg-surface-raised">
                    {item.imageUrl ? (
                      <Image src={item.imageUrl} alt={item.title} fill sizes="48px" className="object-cover" />
                    ) : (
                      <NewsPlaceholder source={item.source} size="tiny" />
                    )}
                  </div>
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-sm leading-snug text-foreground group-hover:text-accent">{item.title}</span>
                    <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-foreground-muted">{item.source}</span>
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Best-effort thumbnails aren't always available (og:image fetch failed,
 * or timed out) -- rather than a broken image or a blank tile, show a
 * quiet source-branded gradient card, same "omit rather than fake it"
 * spirit as the rest of the news pipeline. */
function NewsPlaceholder({ source, size = "large" }: { source: string; size?: "large" | "compact" | "tiny" }) {
  const textSize = size === "large" ? "text-4xl" : size === "compact" ? "text-2xl" : "text-sm";
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-surface-raised to-background">
      <span className={`font-serif text-accent/40 ${textSize}`} style={{ fontFamily: "var(--font-display)" }}>
        {source[0]}
      </span>
    </div>
  );
}

function SourceBadge({ source, small = false }: { source: string; small?: boolean }) {
  return (
    <span
      className={`inline-block rounded-full bg-accent/90 text-background ${
        small ? "px-1.5 py-0.5 text-[8px]" : "px-2 py-0.5 text-[9px]"
      } uppercase tracking-wide`}
    >
      {source}
    </span>
  );
}
