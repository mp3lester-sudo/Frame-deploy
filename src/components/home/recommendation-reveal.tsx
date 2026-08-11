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
    <div className="relative h-[368px] overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-raised sm:h-[440px]">
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
          <div className="reveal-glow absolute inset-x-0 bottom-0 p-5 sm:p-6">
            <Link href={href} className="block">
              <p className="reveal-fade-up text-[10px] font-medium uppercase tracking-wider text-accent">
                {isColdStart ? "A pick for you" : "Tonight's pick"}
              </p>
              <h2
                className="font-display reveal-fade-up mt-1 text-2xl text-foreground [animation-delay:60ms] sm:text-3xl"
                style={{ textShadow: "0 0 16px rgba(217,184,118,0.55), 0 0 36px rgba(217,184,118,0.35)" }}
              >
                {title.name}
              </h2>
              {meta && (
                <p className="reveal-fade-up mt-1 text-xs uppercase tracking-wider text-foreground-muted [animation-delay:110ms]">
                  {meta}
                </p>
              )}
            </Link>

            <div className="reveal-fade-up mt-3 flex flex-wrap items-center gap-2 [animation-delay:160ms]">
              {title.genres?.[0] && (
                <span className="rounded-[var(--radius-sm)] border border-accent/40 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-accent">
                  {title.genres[0]}
                </span>
              )}
              {matchPercent !== null && (
                <span className="rounded-[var(--radius-full)] border border-accent/50 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
                  {displayPercent}% match
                </span>
              )}
            </div>

            <Link href={href} className="reveal-fade-up mt-3 block [animation-delay:210ms]">
              <p className="font-display line-clamp-2 border-l-2 border-accent pl-3 text-sm italic leading-relaxed text-foreground-muted sm:text-base">
                {reason}
              </p>
            </Link>

            <div className="reveal-fade-up [animation-delay:260ms]">
              <WhyThisPick detail={detail} />
            </div>

            {picks.length > 1 && (
              <button
                type="button"
                onClick={generateAnother}
                className="reveal-fade-up mt-3 flex items-center gap-1.5 rounded-[var(--radius-full)] border border-accent/30 px-3 py-1.5 text-[11px] uppercase tracking-wider text-accent-soft transition-colors hover:border-accent/60 hover:text-accent [animation-delay:310ms]"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M21 12a9 9 0 1 1-2.64-6.36M21 4v5h-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Generate another pick
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
