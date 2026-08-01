import Image from "@/components/ui/fade-image";
import Link from "next/link";
import type { Database } from "@/lib/supabase/types";
import type { ReasonDetail } from "@/lib/recommendations/explain";
import { formatRuntime } from "@/lib/utils";
import { WhyThisPick } from "./why-this-pick";

type Title = Database["public"]["Tables"]["titles"]["Row"];

/**
 * Front-and-center "spotlight" hero for the Solo home view: the backdrop
 * fills the whole card edge to edge, and everything that explains the
 * pick (title, meta, match %, reason, Why this pick) is anchored at the
 * bottom on a gradient scrim -- the same bottom-anchored pattern as the
 * profile banner and the movie page's own BackdropHero -- instead of
 * living beside a fixed-size poster the way the old card did. Sits next
 * to DirectorOfTheDay at a matching fixed height so the two read as one
 * paired row rather than a card plus a rail item.
 *
 * Deliberately a new component rather than a rewrite of
 * HeroRecommendation, which CompanionPicker's date-night/with-friends
 * flow still uses in its original poster+text form -- that context
 * wasn't part of this request, so it's left untouched.
 */
export function SpotlightRecommendation({
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
  const backdropImage = title.backdrop_url ?? title.poster_url;
  const href = `/movie/${title.id}`;

  return (
    <div className="relative h-[368px] overflow-hidden rounded-[var(--radius-lg)] bg-surface-raised sm:h-[440px]">
      {backdropImage && (
        <Link href={href} className="absolute inset-0" tabIndex={-1} aria-hidden="true">
          <Image
            src={backdropImage}
            alt=""
            fill
            priority
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 60vw"
          />
        </Link>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-background via-background/80 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
        <Link href={href} className="block">
          <p className="text-[10px] font-medium uppercase tracking-wider text-accent">Tonight&apos;s pick</p>
          <h2
            className="font-display mt-1 text-2xl text-foreground sm:text-3xl"
            style={{ textShadow: "0 0 16px rgba(217,184,118,0.55), 0 0 36px rgba(217,184,118,0.35)" }}
          >
            {title.name}
          </h2>
          {meta && <p className="mt-1 text-xs uppercase tracking-wider text-foreground-muted">{meta}</p>}
        </Link>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {title.genres?.[0] && (
            <span className="rounded-[var(--radius-sm)] border border-accent/40 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-accent">
              {title.genres[0]}
            </span>
          )}
          {matchPercent !== null && (
            <span className="rounded-[var(--radius-full)] border border-accent/50 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
              {matchPercent}% match
            </span>
          )}
        </div>

        <Link href={href} className="mt-3 block">
          <p className="font-display line-clamp-2 border-l-2 border-accent pl-3 text-sm italic leading-relaxed text-foreground-muted sm:text-base">
            {reason}
          </p>
        </Link>

        <WhyThisPick detail={detail} />
      </div>
    </div>
  );
}
