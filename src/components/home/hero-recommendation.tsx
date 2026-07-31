import Image from "@/components/ui/fade-image";
import Link from "next/link";
import type { Database } from "@/lib/supabase/types";
import type { ReasonDetail } from "@/lib/recommendations/explain";
import { formatRuntime } from "@/lib/utils";
import { WhyThisPick } from "./why-this-pick";

type Title = Database["public"]["Tables"]["titles"]["Row"];

/**
 * "Poster in lights" hero -- the movie's own natural portrait poster,
 * large and centered, under a gold spotlight glow. Deliberately NOT the
 * literal dotted-bulb marquee treatment used for the home page
 * greeting's first name (.marquee-bulbs in globals.css) -- that reads
 * as a fun neon sign, but spelling out a real movie title in individual
 * light bulbs read as kitschy/corny on this card. A radial glow behind
 * the poster plus a warm text-shadow on the title gets the "lit up"
 * feeling across without the theme-park look.
 *
 * The poster itself has no hard outline -- a crisp border ring read as
 * a picture frame, which fought the "lit from behind" effect. Instead
 * its lift comes from a diffused gold glow in the box-shadow (blurred,
 * no spread edge) layered under a plain dark drop shadow, so the poster
 * looks like it's glowing rather than boxed.
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
    <div className="relative overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface px-4 pb-6 pt-8 text-center transition-colors hover:border-border-strong sm:px-8 sm:pb-8 sm:pt-10">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72 sm:h-[26rem]"
        style={{
          background: "radial-gradient(ellipse 70% 100% at 50% 0%, rgba(217,184,118,0.4), transparent 75%)",
        }}
      />

      <Link href={`/movie/${title.id}`} className="relative block">
        <span className="text-[10px] font-medium uppercase tracking-wider text-accent">Featured for you</span>

        <div className="relative mx-auto mt-4 h-[336px] w-56 overflow-hidden rounded-[var(--radius-md)] bg-surface-raised shadow-[0_24px_50px_-14px_rgba(0,0,0,0.7),0_0_70px_-6px_rgba(217,184,118,0.55)] sm:h-[432px] sm:w-72">
          {posterImage && (
            <Image src={posterImage} alt={title.name} fill priority className="object-cover" sizes="(max-width: 640px) 224px, 288px" />
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
