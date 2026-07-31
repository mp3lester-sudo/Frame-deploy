import Image from "@/components/ui/fade-image";
import Link from "next/link";
import type { Database } from "@/lib/supabase/types";
import type { ReasonDetail } from "@/lib/recommendations/explain";
import { formatRuntime } from "@/lib/utils";
import { WhyThisPick } from "./why-this-pick";

type Title = Database["public"]["Tables"]["titles"]["Row"];

/**
 * "Poster in lights" hero -- the movie's own natural portrait poster,
 * floating directly on the page background (no bordered card wrapper)
 * with a gold spotlight glow radiating around it. Sized down from the
 * earlier full-bleed-in-a-card version -- without a card to fill,
 * stretching the poster to the page's own content width read as
 * oversized, so it's back to a fixed, smaller centered size, but still
 * with no side padding/border of its own.
 *
 * No "Featured for you" label -- removed per feedback; the glow +
 * prominent placement already read as "this is the pick" on its own.
 *
 * Deliberately NOT the literal dotted-bulb marquee treatment used for
 * the home page greeting's first name (.marquee-bulbs in globals.css)
 * -- that reads as a fun neon sign, but spelling out a real movie title
 * in individual light bulbs read as kitschy/corny here. A radial glow
 * behind the poster plus a warm text-shadow on the title gets the
 * "lit up" feeling across without the theme-park look. With no card to
 * clip it, the glow now lives in the poster's own box-shadow (visible
 * on all sides) rather than an ambient div that only showed above it.
 *
 * Earlier version of this card used the landscape backdrop_url stretched
 * across a wide box (the streaming-dashboard "Option B" direction). This
 * reverts to the poster's natural 2:3 portrait aspect ratio -- the art
 * a poster was actually composed for, rather than a crop of a wide key
 * art image standing in for it.
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

  return (
    <div className="relative text-center">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72 sm:h-80"
        style={{
          background: "radial-gradient(ellipse 60% 100% at 50% 10%, rgba(217,184,118,0.35), transparent 75%)",
        }}
      />

      <Link href={`/movie/${title.id}`} className="relative block">
        <div className="relative mx-auto h-[288px] w-48 overflow-hidden rounded-[var(--radius-md)] bg-surface-raised shadow-[0_24px_50px_-14px_rgba(0,0,0,0.7),0_0_80px_-4px_rgba(217,184,118,0.6)] sm:h-[360px] sm:w-60">
          {posterImage && (
            <Image src={posterImage} alt={title.name} fill priority className="object-cover" sizes="(max-width: 640px) 192px, 240px" />
          )}
        </div>

        <h2
          className="font-display mt-5 text-3xl text-foreground sm:text-4xl"
          style={{ textShadow: "0 0 18px rgba(217,184,118,0.65), 0 0 40px rgba(217,184,118,0.4)" }}
        >
          {title.name}
        </h2>
        {meta && <p className="mt-1 text-xs uppercase tracking-wider text-foreground-muted">{meta}</p>}

        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
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
      </Link>

      <div className="relative mx-auto mt-6 max-w-sm text-left">
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
