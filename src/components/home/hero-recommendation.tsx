import Image from "next/image";
import type { heroRecommendation as HeroRecommendationType } from "@/lib/demo/home-demo-data";

export function HeroRecommendation({ rec }: { rec: typeof HeroRecommendationType }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
      <div className="relative flex aspect-[16/10] items-start justify-between bg-surface-raised p-4">
        {rec.posterUrl && (
          <Image
            src={rec.posterUrl}
            alt={rec.title}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 576px"
          />
        )}
        <span className="relative rounded-[var(--radius-sm)] bg-background/70 px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-accent backdrop-blur-sm">
          {rec.genreBadge}
        </span>
        <span className="relative rounded-[var(--radius-full)] border border-accent/50 bg-background/70 px-3 py-1 text-xs font-semibold text-accent backdrop-blur-sm">
          {rec.matchPercent}% match
        </span>
      </div>

      <div className="p-5">
        <h2 className="font-display text-2xl">{rec.title}</h2>
        <p className="mt-1 text-[11px] uppercase tracking-wider text-foreground-muted">
          {rec.year} &middot; {rec.director} &middot; {rec.runtimeMinutes}m &middot; {rec.genres.join(", ")}
        </p>
        <p className="font-display mt-4 border-l-2 border-accent pl-3 italic leading-relaxed text-foreground-muted">
          {rec.reason}
        </p>
      </div>
    </div>
  );
}
