import Image from "@/components/ui/fade-image";
import type { IndieRelease } from "@/lib/news/tmdb-releases";
import type { IndieNewsItem } from "@/lib/news/indie-news";

/**
 * Compact "Indie Buzz" strip for the top of the Social feed -- same live
 * TMDB release + IndieWire headline data as the home page's IndieSpotlight
 * section (see components/home/indie-spotlight.tsx), condensed into a
 * couple of horizontal-scroll rows so it fits above a single-column
 * Twitter-style timeline instead of the home page's wider layout.
 *
 * Marquee treatment (part of the Social tab redesign): sprocket-hole rows
 * top and bottom turn the strip into a filmstrip band, distinct from the
 * bento-card posts below it -- this is meant to read as a physical reel
 * running along the top of the page, not another card in the feed.
 */
function SprocketRow() {
  return (
    <div
      aria-hidden="true"
      className="h-[5px] w-full"
      style={{
        backgroundImage: "radial-gradient(circle, var(--background) 2px, transparent 2.5px)",
        backgroundSize: "14px 5px",
        backgroundRepeat: "repeat-x",
      }}
    />
  );
}

export function IndieBuzzStrip({ releases, news }: { releases: IndieRelease[]; news: IndieNewsItem[] }) {
  if (!releases.length && !news.length) return null;

  return (
    <div className="border-b border-border bg-surface">
      <SprocketRow />

      <div className="px-4 py-3 sm:px-5">
        <span className="text-[10px] uppercase tracking-wider text-accent-soft">Indie Buzz</span>

        {releases.length > 0 && (
          <div className="-mx-1 mt-2.5 flex gap-3 overflow-x-auto px-1 pb-1">
            {releases.slice(0, 8).map((r) => (
              <div key={r.tmdbId} className="w-16 shrink-0">
                <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[var(--radius-sm)] border border-border bg-surface-raised">
                  {r.posterUrl && <Image src={r.posterUrl} alt={r.title} fill sizes="64px" className="object-cover" />}
                </div>
                <p className="mt-1 line-clamp-2 text-[10px] leading-tight text-foreground-muted">{r.title}</p>
              </div>
            ))}
          </div>
        )}

        {news.length > 0 && (
          <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
            {news.slice(0, 6).map((item, i) => (
              <a
                key={i}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 whitespace-nowrap rounded-full border border-border bg-surface-raised px-3 py-1.5 text-xs text-foreground hover:border-accent/50 hover:text-accent"
              >
                {item.title.length > 60 ? `${item.title.slice(0, 57)}…` : item.title}
              </a>
            ))}
          </div>
        )}
      </div>

      <SprocketRow />
    </div>
  );
}
