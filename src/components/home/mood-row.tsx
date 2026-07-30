import Image from "@/components/ui/fade-image";
import Link from "next/link";
import type { Recommendation } from "@/lib/recommendations/engine";

export function MoodRow({ picks, isColdStart }: { picks: Recommendation[]; isColdStart: boolean }) {
  if (!picks.length) return null;

  return (
    <div>
      <h3 className="font-display mb-3 text-lg">{isColdStart ? "Popular right now" : "More picks for you"}</h3>
      <div className="grid grid-cols-2 gap-3">
        {picks.map(({ title, reason, matchPercent }) => (
          <Link key={title.id} href={`/movie/${title.id}`} className="group">
            <div className="relative aspect-[2/3] overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface transition-colors group-hover:border-border-strong">
              {title.poster_url && (
                <Image
                  src={title.poster_url}
                  alt={title.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 50vw, 288px"
                />
              )}
              {title.genres?.[0] && (
                <span className="absolute left-2 top-2 rounded-[var(--radius-sm)] bg-background/70 px-2 py-0.5 text-[10px] uppercase tracking-wider text-accent backdrop-blur-sm">
                  {title.genres[0]}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm font-medium">{title.name}</p>
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
