import Image from "@/components/ui/fade-image";
import Link from "next/link";
import type { Database } from "@/lib/supabase/types";
import type { ReasonDetail } from "@/lib/recommendations/explain";
import { formatRuntime } from "@/lib/utils";
import { WhyThisPick } from "./why-this-pick";

type Title = Database["public"]["Tables"]["titles"]["Row"];

/**
 * Full-bleed featured banner (Option B / streaming-dashboard direction)
 * — a landscape backdrop image with title/match overlaid via a bottom
 * gradient, replacing the earlier side-by-side small-poster + text card.
 * Uses backdrop_url (16:9-ish key art, same source as the movie detail
 * page's own hero) rather than the 2:3 poster; poster_url is only a
 * fallback for the rare title with no backdrop, since stretching a
 * portrait poster across a wide box is exactly the crop-heavy mistake
 * the movie page's BackdropHero comments warn about avoiding.
 */
export function HeroRecommendation({
  title,
  reason,
  detail,
  matchPercent,
  director,
}: {
  title: Title;
  reason: string;
  detail: ReasonDetail;
  /** null for cold-start picks, where a match % would be meaningless. */
  matchPercent: number | null;
  director: string | null;
}) {
  const year = title.release_date?.slice(0, 4);
  const meta = [year, formatRuntime(title.runtime_minutes), director].filter(Boolean).join(" · ");
  const bannerImage = title.backdrop_url ?? title.poster_url;

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface transition-colors hover:border-border-strong">
      <Link href={`/movie/${title.id}`} className="block">
        <div className="relative h-56 w-full overflow-hidden bg-surface-raised sm:h-72">
          {bannerImage && (
            <Image src={bannerImage} alt={title.name} fill priority className="object-cover object-top" sizes="(max-width: 640px) 100vw, 576px" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-medium uppercase tracking-wider text-accent">Featured for you</span>
              {title.genres?.[0] && (
                <span className="rounded-[var(--radius-sm)] bg-background/70 px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-accent backdrop-blur-sm">
                  {title.genres[0]}
                </span>
              )}
              {matchPercent !== null && (
                <span className="rounded-[var(--radius-full)] border border-accent/50 bg-background/70 px-3 py-1 text-xs font-semibold text-accent backdrop-blur-sm">
                  {matchPercent}% match
                </span>
              )}
            </div>
            <h2 className="font-display mt-2 text-3xl text-foreground sm:text-4xl">{title.name}</h2>
            {meta && <p className="mt-1 text-xs uppercase tracking-wider text-foreground-muted">{meta}</p>}
          </div>
        </div>
      </Link>

      <div className="p-4 sm:p-5">
        <p className="font-display border-l-2 border-accent pl-3 text-base italic leading-relaxed text-foreground-muted">
          {reason}
        </p>
        <div className="mt-3">
          <WhyThisPick detail={detail} />
        </div>
      </div>
    </div>
  );
}
