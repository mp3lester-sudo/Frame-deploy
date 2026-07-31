import Image from "@/components/ui/fade-image";
import Link from "next/link";
import type { Database } from "@/lib/supabase/types";
import type { ReasonDetail } from "@/lib/recommendations/explain";
import { formatRuntime } from "@/lib/utils";
import { WhyThisPick } from "./why-this-pick";

type Title = Database["public"]["Tables"]["titles"]["Row"];

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

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface transition-colors hover:border-border-strong">
      {/* WhyThisPick's toggle button lives outside this Link — a <button>
          nested inside an <a> is invalid HTML and breaks click handling. */}
      <Link href={`/movie/${title.id}`} className="block">
        <div className="flex gap-5 p-5">
          {/* Posters are 2:3 — the old aspect-[16/10] full-bleed banner
              cropped most of the artwork off (and cut the title lettering
              at the bottom entirely). This box matches the poster's own
              ratio so the whole thing is visible, same pattern as the
              movie/person detail pages. Sized noticeably larger than the
              "More picks for you" grid tiles below (see mood-row.tsx) --
              this is the single featured pick, not one tile among many,
              and should read as clearly the biggest thing on the page. */}
          {/* "More picks for you" grid tiles below are ~266px wide
              (max-w-xl container minus padding, split by grid-cols-2/gap-3
              -- see mood-row.tsx). This poster is set wider than that on
              purpose so the single featured pick reads as unambiguously
              bigger than any individual tile in the grid underneath it. */}
          <div className="relative aspect-[2/3] w-40 shrink-0 overflow-hidden rounded-[var(--radius-md)] bg-surface-raised sm:w-72">
            {title.poster_url && (
              <Image
                src={title.poster_url}
                alt={title.name}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 160px, 288px"
              />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {title.genres?.[0] && (
                <span className="rounded-[var(--radius-sm)] bg-background px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-accent">
                  {title.genres[0]}
                </span>
              )}
              {matchPercent !== null && (
                <span className="rounded-[var(--radius-full)] border border-accent/50 bg-background px-3 py-1 text-xs font-semibold text-accent">
                  {matchPercent}% match
                </span>
              )}
            </div>

            <h2 className="font-display mt-2 text-3xl sm:text-4xl">{title.name}</h2>
            {meta && (
              <p className="mt-1 text-xs uppercase tracking-wider text-foreground-muted">{meta}</p>
            )}
            <p className="font-display mt-3 border-l-2 border-accent pl-3 text-base italic leading-relaxed text-foreground-muted">
              {reason}
            </p>
          </div>
        </div>
      </Link>

      <div className="px-5 pb-5">
        <WhyThisPick detail={detail} />
      </div>
    </div>
  );
}
