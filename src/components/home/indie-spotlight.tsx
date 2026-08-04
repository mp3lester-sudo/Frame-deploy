import Image from "@/components/ui/fade-image";
import type { IndieRelease } from "@/lib/news/tmdb-releases";
import { formatReleaseDate } from "@/lib/news/tmdb-releases";
import type { IndieNewsItem } from "@/lib/news/indie-news";

/**
 * Home page "Indie Spotlight" section -- a horizontal strip of new/
 * upcoming releases from indie-leaning distributors (A24, NEON, Magnolia,
 * Searchlight) paired with a short list of live IndieWire headlines.
 * Renders nothing if both live fetches came back empty (network hiccup,
 * rate limit, etc.) rather than showing an awkward empty section.
 */
export function IndieSpotlight({ releases, news }: { releases: IndieRelease[]; news: IndieNewsItem[] }) {
  if (!releases.length && !news.length) return null;

  return (
    <section className="mt-8 border-t border-border pt-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-[10px] uppercase tracking-wider text-foreground-muted">Indie Spotlight</span>
        <span className="text-[11px] text-foreground-muted">New &amp; upcoming from A24, NEON, Magnolia &amp; Searchlight</span>
      </div>

      {releases.length > 0 && (
        <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
          {releases.map((r) => (
            <div key={r.tmdbId} className="w-[112px] shrink-0 sm:w-[128px]">
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
        <div className={`flex flex-col gap-2.5 ${releases.length > 0 ? "mt-5" : ""}`}>
          {news.map((item, i) => (
            <a
              key={i}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm leading-snug text-foreground hover:text-accent"
            >
              {item.title}
              <span className="ml-2 text-[11px] uppercase tracking-wide text-foreground-muted">{item.source}</span>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
