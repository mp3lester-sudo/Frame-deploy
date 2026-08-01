import Image from "@/components/ui/fade-image";
import Link from "next/link";
import type { SignaturePick } from "@/lib/taste-dna/signature-pick";
import { formatRuntime } from "@/lib/utils";
import { WhyThisPick } from "@/components/home/why-this-pick";

/**
 * The Taste DNA page's headline feature: a single film crowned "the movie
 * that says the most about you" -- highest raw content-vector similarity
 * to this person's whole rating history (see signature-pick.ts), not a
 * "watch this next" suggestion. Deliberately mirrors HeroRecommendation's
 * visual language (gradient panel, poster+text grid, match% pill,
 * WhyThisPick's expandable chips) so this reads as a sibling of the home
 * page's hero card rather than a one-off design, while swapping the
 * eyebrow/copy to make the different framing ("this is who you are,"
 * not "watch this tonight") unmistakable.
 *
 * `compact` drops the side-by-side poster+text grid in favor of always
 * stacking -- the grid's sm: breakpoint is viewport-width based, so on the
 * profile page (where this now sits in a half-width column next to
 * Personal Pyramid) it was flipping to side-by-side well before there was
 * actually 140px+text worth of room, wrapping the eyebrow copy one word
 * per line. The standalone /taste-dna page has the whole page width to
 * itself, so it keeps the responsive side-by-side version. Built with
 * plain ternaries (not a blanket "sm:" string prefix) because several of
 * these pairs share a base utility with a different value at sm: (p-5 vs
 * sm:p-6, text-center vs sm:text-left, etc.) -- naively turning "sm:p-6"
 * into an unconditional "p-6" would leave both "p-5" and "p-6" present at
 * once with no media query to resolve the conflict.
 */
export function SignaturePickCard({ pick, compact = false }: { pick: SignaturePick; compact?: boolean }) {
  const { title, matchPercent, detail } = pick;
  const year = title.release_date?.slice(0, 4);
  const meta = [year, formatRuntime(title.runtime_minutes)].filter(Boolean).join(" · ");
  const posterImage = title.poster_url ?? title.backdrop_url;
  const href = `/movie/${title.id}`;

  return (
    <div
      className={`rounded-[var(--radius-lg)] p-5 ${compact ? "" : "sm:p-6"}`}
      style={{
        background: "linear-gradient(135deg, rgba(217,184,118,0.11), rgba(217,184,118,0.02))",
        border: "1px solid rgba(217,184,118,0.22)",
      }}
    >
      <div className={`grid gap-5 ${compact ? "" : "sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-x-6"}`}>
        <Link
          href={href}
          className={`relative mx-auto h-[210px] w-[140px] shrink-0 overflow-hidden rounded-[var(--radius-md)] bg-surface-raised shadow-[0_20px_44px_-14px_rgba(0,0,0,0.7),0_0_60px_2px_rgba(217,184,118,0.5)] ${compact ? "" : "sm:col-start-1 sm:row-start-1 sm:row-span-2 sm:mx-0"}`}
        >
          {posterImage && (
            <Image src={posterImage} alt={title.name} fill className="object-cover" sizes="140px" />
          )}
        </Link>

        <div className={`text-center ${compact ? "" : "sm:col-start-2 sm:row-start-1 sm:text-left"}`}>
          <Link href={href} className="block">
            <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-accent">
              The movie that says the most about you
            </p>
            <h2 className={`font-display mt-1 text-2xl text-foreground ${compact ? "" : "sm:text-3xl"}`}>
              {title.name}
            </h2>
            {meta && <p className="mt-1 text-xs uppercase tracking-wider text-foreground-muted">{meta}</p>}
          </Link>

          <div className={`mt-3 flex flex-wrap items-center justify-center gap-2 ${compact ? "" : "sm:justify-start"}`}>
            {title.genres?.[0] && (
              <span className="rounded-[var(--radius-sm)] border border-accent/40 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-accent">
                {title.genres[0]}
              </span>
            )}
            <span className="rounded-[var(--radius-full)] border border-accent/50 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
              {matchPercent}% you
            </span>
          </div>

          <Link href={href} className="mt-4 block text-left">
            <p
              className={`font-display border-l-2 border-accent pl-3 text-sm italic leading-relaxed text-foreground-muted ${compact ? "" : "sm:text-base"}`}
            >
              {detail.headline}
            </p>
          </Link>
        </div>

        <div className={`text-center ${compact ? "" : "sm:col-start-2 sm:row-start-2 sm:text-left"}`}>
          <div className="mt-1">
            <WhyThisPick detail={detail} />
          </div>
        </div>
      </div>
    </div>
  );
}
