import Image from "@/components/ui/fade-image";
import Link from "next/link";
import type { Recommendation } from "@/lib/recommendations/engine";

/**
 * Horizontal-scrolling poster rail (Option B / streaming-dashboard
 * direction) -- same scrollable-rail pattern as PersonIconicRoles and
 * the Discover genre filters (see globals.css's .no-scrollbar), swapped
 * in for the earlier static 2-column grid so this reads as a "row" the
 * user scrubs through rather than a stacked list.
 */
export function MoodRow({ picks, isColdStart }: { picks: Recommendation[]; isColdStart: boolean }) {
  if (!picks.length) return null;

  return (
    <div>
      <h3 className="font-display mb-3 text-lg">{isColdStart ? "Popular right now" : "More picks for you"}</h3>
      <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
        {picks.map(({ title, reason, matchPercent }, i) => (
          <Link
            key={title.id}
            href={`/movie/${title.id}`}
            className="stagger-card group w-32 shrink-0 transition-transform duration-200 hover:-translate-y-1 sm:w-36"
            style={{ animationDelay: `${(i % 12) * 40}ms` }}
          >
            <div className="relative aspect-[2/3] overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface transition-colors group-hover:border-border-strong">
              {title.poster_url && (
                <Image
                  src={title.poster_url}
                  alt={title.name}
                  fill
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                  sizes="144px"
                />
              )}
              {title.genres?.[0] && (
                <span className="absolute left-2 top-2 rounded-[var(--radius-sm)] bg-background/70 px-2 py-0.5 text-[10px] uppercase tracking-wider text-accent backdrop-blur-sm">
                  {title.genres[0]}
                </span>
              )}
            </div>
            <p className="mt-2 line-clamp-1 text-sm font-medium">{title.name}</p>
            {!isColdStart && matchPercent !== null && (
              <p className="mt-0.5 text-[11px] uppercase tracking-wider text-foreground-muted">
                {matchPercent}% match
              </p>
            )}
            <p className="mt-1 line-clamp-2 text-xs text-foreground-muted">{reason}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
