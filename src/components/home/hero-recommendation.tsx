import Image from "@/components/ui/fade-image";
import Link from "next/link";
import type { Database } from "@/lib/supabase/types";
import type { ReasonDetail } from "@/lib/recommendations/explain";
import { formatRuntime } from "@/lib/utils";
import { WhyThisPick } from "./why-this-pick";

type Title = Database["public"]["Tables"]["titles"]["Row"];

/**
 * "Spotlight card" hero -- poster and everything explaining why it was
 * picked live together inside one soft gradient panel (a faint gold
 * wash, no hard border), side by side on larger screens. That panel is
 * what makes this read as a distinct featured card rather than just a
 * bigger entry in the plain list rows below it (mood row, "More picks").
 *
 * Earlier passes tried a plain left-aligned poster+text stack with no
 * panel at all -- fixed the alignment inconsistency against the rows
 * below, but without any container of its own the hero blended into
 * those rows instead of standing out as "the recommendation." The
 * panel (plus the "Tonight's pick" label) restores that hierarchy
 * without reintroducing a hard-bordered card, which read as too boxy
 * for a single hero moment.
 *
 * CSS grid (not flex) so the poster and the "Why this pick" toggle
 * below the text can both be positioned against the same two columns
 * without hardcoding a matching left offset -- the WhyThisPick button
 * has to stay OUTSIDE any of the <Link>s (it's its own interactive
 * element; nesting a button inside an <a> is invalid and would also
 * make its clicks navigate away), so it's a separate grid item placed
 * under the text column via row/column-start rather than a descendant
 * of the same link that wraps the title/quote.
 *
 * Poster keeps its natural 2:3 portrait ratio and its own soft gold
 * box-shadow glow (blur only, no spread, so it falls off with no hard
 * edge) -- the panel's own wash is much fainter and is there to unify
 * the whole card, not to compete with the poster's glow.
 *
 * Stacks (poster above text) below sm; goes side by side at sm and up,
 * since the fixed-width poster plus a full text column needs more than
 * a narrow phone width to sit comfortably next to each other.
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
  const posterImage = title.poster_url ?? title.backdrop_url;
  const href = `/movie/${title.id}`;

  return (
    <div
      className="rounded-[var(--radius-lg)] p-5 sm:p-6"
      style={{
        background: "linear-gradient(135deg, rgba(217,184,118,0.09), rgba(217,184,118,0.02))",
      }}
    >
      <div className="grid gap-5 sm:grid-cols-[184px_minmax(0,1fr)] sm:gap-x-6">
        <Link
          href={href}
          className="relative mx-auto h-[240px] w-40 shrink-0 overflow-hidden rounded-[var(--radius-md)] bg-surface-raised shadow-[0_20px_44px_-14px_rgba(0,0,0,0.7),0_0_70px_2px_rgba(217,184,118,0.55)] sm:col-start-1 sm:row-start-1 sm:row-span-2 sm:mx-0 sm:h-[276px] sm:w-[184px]"
        >
          {posterImage && (
            <Image src={posterImage} alt={title.name} fill priority className="object-cover" sizes="(max-width: 640px) 160px, 184px" />
          )}
        </Link>

        <div className="text-center sm:col-start-2 sm:row-start-1 sm:text-left">
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

          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
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

          <Link href={href} className="mt-4 block text-left">
            <p className="font-display border-l-2 border-accent pl-3 text-sm italic leading-relaxed text-foreground-muted sm:text-base">
              {reason}
            </p>
          </Link>
        </div>

        <div className="text-center sm:col-start-2 sm:row-start-2 sm:text-left">
          <div className="mt-1">
            <WhyThisPick detail={detail} />
          </div>
        </div>
      </div>
    </div>
  );
}
