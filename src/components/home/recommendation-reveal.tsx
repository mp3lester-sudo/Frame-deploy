"use client";

import { useEffect, useRef, useState } from "react";
import Image from "@/components/ui/fade-image";
import Link from "next/link";
import type { Database } from "@/lib/supabase/types";
import type { ReasonDetail } from "@/lib/recommendations/explain";
import { formatRuntime } from "@/lib/utils";
import { WhyThisPick } from "./why-this-pick";

type Title = Database["public"]["Tables"]["titles"]["Row"];

export interface RevealPick {
  title: Title;
  reason: string;
  detail: ReasonDetail;
  matchPercent: number | null;
  director: string | null;
}

// How long the tap-triggered sweep plays before the pick underneath is
// swapped/revealed -- matches .polish-sweep's own 1000ms animation
// duration (globals.css) minus a little so the reveal lands right as the
// sweep is fading out, not after it's fully gone.
const SWEEP_MS = 700;
// On "Generate another pick", the content swap happens partway through a
// second sweep pass so the old card's content never visibly pops --
// it's covered by the sweep at the moment it changes underneath.
const CYCLE_SWAP_MS = 380;
const MATCH_COUNT_UP_MS = 700;

/**
 * Replaces the old always-visible SpotlightRecommendation for the Solo
 * home view: the hero pick starts sealed (a pulsing prompt, no image,
 * no title -- nothing given away) and only reveals itself on tap, then
 * offers a low-key "Generate another pick" to cycle through a small
 * reserve pool without ever touching what MoodRow shows below it (see
 * page.tsx -- `picks` here is deliberately hero + a couple of reserve
 * candidates that MoodRow never renders, so cycling here can never
 * duplicate a poster already visible in "More picks for you").
 *
 * This was a deliberate product call, not just a visual one: the AI
 * recommendation is Backlot's whole differentiator, and a fully-formed
 * card that's already on screen the instant the page paints reads as
 * decoration, not something that happened for you. Gating it behind a
 * tap -- with a beat of "working" in between -- makes the same pick feel
 * generated rather than merely displayed.
 */
export function RecommendationReveal({ picks, isColdStart }: { picks: RevealPick[]; isColdStart: boolean }) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"sealed" | "sweeping" | "revealed">("sealed");
  const [displayPercent, setDisplayPercent] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const current = picks[index];

  useEffect(() => {
    const activeTimers = timers.current;
    return () => {
      activeTimers.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    if (phase !== "revealed" || current?.matchPercent == null) return;
    const target = current.matchPercent;
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / MATCH_COUNT_UP_MS);
      setDisplayPercent(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the phase/index actually change, not on every render
  }, [phase, index]);

  if (!current) return null;

  function reveal() {
    if (phase !== "sealed") return;
    setPhase("sweeping");
    setDisplayPercent(0);
    timers.current.push(setTimeout(() => setPhase("revealed"), SWEEP_MS));
  }

  function generateAnother() {
    if (phase !== "revealed" || picks.length < 2) return;
    setPhase("sweeping");
    setDisplayPercent(0);
    timers.current.push(
      setTimeout(() => setIndex((i) => (i + 1) % picks.length), CYCLE_SWAP_MS),
      setTimeout(() => setPhase("revealed"), SWEEP_MS)
    );
  }

  const { title, reason, detail, matchPercent, director } = current;
  const year = title.release_date?.slice(0, 4);
  const meta = [year, formatRuntime(title.runtime_minutes), director].filter(Boolean).join(" · ");
  const backdropImage = title.backdrop_url ?? title.poster_url;
  const href = `/movie/${title.id}`;
  const revealed = phase === "revealed";

  return (
    // Dramatically taller than the old 368/440px card, and no longer
    // paired 1.6fr/1fr next to HiddenGemCard (see page.tsx) -- the AI
    // recommendation is Backlot's whole differentiator, so this is now
    // the unambiguous focal point of the page: full column width, the
    // tallest single element on the home page by a wide margin, with
    // everything else (mood row, social feed, hidden gem) demoted below
    // it at a visibly smaller, quieter scale.
    <div className="relative h-[480px] overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-raised sm:h-[600px] lg:h-[680px]">
      {phase === "sealed" && (
        <button
          type="button"
          onClick={reveal}
          aria-label="Tap to generate tonight's recommendation"
          className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center"
          style={{ background: "radial-gradient(circle at 30% 20%, var(--spotlight), var(--surface) 65%)" }}
        >
          <span className="breathe-glow flex h-16 w-16 items-center justify-center rounded-full border border-accent/40 bg-accent/10 text-accent">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M12 3v3M12 18v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M3 12h3M18 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" strokeLinecap="round" />
            </svg>
          </span>
          <span>
            <span className="font-display block text-xl text-foreground sm:text-2xl">
              {isColdStart ? "A pick is ready" : "Tonight's pick is ready"}
            </span>
            <span className="mt-1 block text-[11px] uppercase tracking-wider text-foreground-muted">
              Tap to generate your recommendation
            </span>
          </span>
        </button>
      )}

      {phase === "sweeping" && (
        <div aria-hidden="true" className="polish-sweep pointer-events-none absolute inset-0 z-10" />
      )}

      {revealed && (
        <>
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
          <div className="reveal-glow absolute inset-x-0 bottom-0 p-5 sm:p-8">
            {/* Badge + meta share one baseline-aligned line instead of
                the match% pill floating in a separate row below the
                title -- cleaner reading order: what is it, is it a good
                match, then the title itself gets its own full-size line
                with nothing competing on it. */}
            <div className="reveal-fade-up flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              {matchPercent !== null && (
                <span className="bg-gold-foil text-accent-foreground rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-bold tracking-wide">
                  {displayPercent}% MATCH
                </span>
              )}
              {meta && <span className="text-xs text-foreground-muted">{meta}</span>}
              {title.genres?.[0] && (
                <span className="text-xs uppercase tracking-wider text-accent-soft">{title.genres[0]}</span>
              )}
            </div>

            <Link href={href} className="block">
              <h2
                className="font-display reveal-fade-up mt-2 text-3xl leading-[1.08] text-foreground [animation-delay:60ms] sm:text-5xl"
                style={{ textShadow: "0 0 20px rgba(217,184,118,0.5), 0 0 44px rgba(217,184,118,0.3)" }}
              >
                {title.name}
              </h2>

              {/* A real sentence now, not a truncated blockquote fragment
                  -- reads as the reason this was picked FOR you, not a
                  decorative caption. */}
              <p className="reveal-fade-up mt-3 max-w-xl text-sm leading-relaxed text-foreground-muted [animation-delay:110ms] sm:text-base">
                {reason}
              </p>
            </Link>

            <div className="reveal-fade-up mt-2 [animation-delay:160ms]">
              <WhyThisPick detail={detail} />
            </div>

            {/* Primary CTA -- previously there was no direct call to
                action at all, only the secondary "generate another"
                cycle button. Same gold-foil treatment as every other
                primary button in the app (wordmark, sign-up, onboarding
                CTAs). */}
            <div className="reveal-fade-up mt-5 flex flex-wrap items-center gap-4 [animation-delay:210ms]">
              <Link
                href={href}
                className="bg-gold-foil text-accent-foreground inline-flex h-12 items-center justify-center rounded-[var(--radius-md)] px-7 text-sm font-semibold uppercase tracking-wide shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_8px_20px_-8px_rgba(205,166,70,0.55)] transition-[filter] hover:brightness-110"
              >
                Watch tonight
              </Link>
              {picks.length > 1 && (
                <button
                  type="button"
                  onClick={generateAnother}
                  className="flex items-center gap-1.5 text-xs text-foreground-muted transition-colors hover:text-accent"
                >
                  Not feeling it? Generate another pick
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
