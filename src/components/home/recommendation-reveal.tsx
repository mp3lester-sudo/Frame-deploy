"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "@/components/ui/fade-image";
import Link from "next/link";
import { Bookmark } from "lucide-react";
import type { Database } from "@/lib/supabase/types";
import type { ReasonDetail } from "@/lib/recommendations/explain";
import { formatRuntime } from "@/lib/utils";
import { addToWatchlist, removeFromWatchlist } from "@/lib/actions/lists";
import { WhyThisPick } from "./why-this-pick";

type Title = Database["public"]["Tables"]["titles"]["Row"];

export interface RevealPick {
  title: Title;
  reason: string;
  detail: ReasonDetail;
  matchPercent: number | null;
  director: string | null;
  // Resolved server-side (one batched query over the whole hero pool, see
  // HomeRecommendationsSection in page.tsx) rather than fetched here --
  // this is a client component with no data-fetching pattern of its own,
  // consistent with the rest of the app (see ContextPicker's comment on
  // why nothing here does client-side fetching).
  initiallyOnWatchlist: boolean;
}

// Tap-to-reveal: a radial match meter counts up from 0% to the pick's
// match score while the backdrop -- already on screen, just heavily
// blurred -- sharpens into focus in the same motion. Replaces the old
// pulsing-icon + opaque-wipe treatment: the meter and the blur clearing
// together read as "the taste engine just finished," rather than a
// decorative curtain being pulled back on something that was already
// sitting there. Both durations are intentionally equal so the number
// finishes counting at the exact moment the image reaches full focus.
const METER_MS = 1400;
// How blurred the backdrop is at rest (sealed) and how far it un-blurs
// over METER_MS. High enough that nothing about the pick is guessable
// before the tap, low enough that the shape/lighting still reads as "a
// real photo," not noise -- part of the tease.
const MAX_BLUR_PX = 36;
const RING_RADIUS = 44;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// "Generate another pick" keeps the original quick opaque-sweep swap
// rather than re-running the full meter animation -- it's a secondary,
// low-stakes action (try again), not the big first-reveal moment the
// meter is built for, and reusing the lighter existing treatment here
// keeps this change scoped to the one moment that actually needed it.
const SWEEP_MS = 700;
const CYCLE_SWAP_MS = 380;

type Phase = "sealed" | "revealing" | "sweeping" | "revealed";

/**
 * Replaces the old always-visible SpotlightRecommendation for the Solo
 * home view: the hero pick starts sealed (blurred backdrop, empty match
 * ring, no title given away) and only reveals itself on tap, then offers
 * a low-key "Generate another pick" to cycle through a small reserve
 * pool without ever touching what MoodRow shows below it (see page.tsx
 * -- `picks` here is deliberately hero + a couple of reserve candidates
 * that MoodRow never renders, so cycling here can never duplicate a
 * poster already visible in "More picks for you").
 *
 * This was a deliberate product call, not just a visual one: the AI
 * recommendation is Marquee's whole differentiator, and a fully-formed
 * card that's already on screen the instant the page paints reads as
 * decoration, not something that happened for you. Gating it behind a
 * tap -- with the match score visibly being calculated in between --
 * makes the same pick feel generated rather than merely displayed.
 */
export function RecommendationReveal({ picks, isColdStart }: { picks: RevealPick[]; isColdStart: boolean }) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("sealed");
  const [displayPercent, setDisplayPercent] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Keyed by title id, not by the current pick alone -- "generate another
  // pick" cycles the hero through picks[] via index, and a toggle made on
  // pick A shouldn't reset just because someone cycled to pick B and back.
  // Falls back to each pick's own server-resolved initiallyOnWatchlist
  // whenever there's no local override yet.
  const [watchlistOverrides, setWatchlistOverrides] = useState<Record<string, boolean>>({});
  const [isWatchlistPending, startWatchlistTransition] = useTransition();

  const current = picks[index];
  const hasMatch = current?.matchPercent != null;
  const onWatchlist = current ? (watchlistOverrides[current.title.id] ?? current.initiallyOnWatchlist) : false;

  function toggleWatchlist() {
    if (!current) return;
    const titleId = current.title.id;
    const next = !onWatchlist;
    setWatchlistOverrides((prev) => ({ ...prev, [titleId]: next }));
    startWatchlistTransition(async () => {
      try {
        await (next ? addToWatchlist(titleId) : removeFromWatchlist(titleId));
      } catch {
        setWatchlistOverrides((prev) => ({ ...prev, [titleId]: !next }));
      }
    });
  }

  useEffect(() => {
    const activeTimers = timers.current;
    return () => {
      activeTimers.forEach(clearTimeout);
    };
  }, []);

  // Drives both the ring's center number and, indirectly, when the meter
  // finishes -- setPhase("revealed") fires the instant the count-up
  // completes, so the number landing on its final value and the content
  // below sliding into place happen in the same beat rather than one
  // waiting on an independent timer that could drift out of sync.
  useEffect(() => {
    if (phase !== "revealing" || !current) return;
    const target = hasMatch ? (current.matchPercent as number) : 100;
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / METER_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayPercent(Math.round(target * eased));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setPhase("revealed");
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the phase/index actually change, not on every render
  }, [phase, index]);

  if (!current) return null;

  function reveal() {
    if (phase !== "sealed") return;
    setDisplayPercent(0);
    setPhase("revealing");
  }

  function generateAnother() {
    if (phase !== "revealed" || picks.length < 2) return;
    // Resolve the next pick's index up front (not inside the timeouts
    // below) so the SWEEP_MS timeout can read ITS matchPercent directly,
    // rather than closing over `current` from render time -- by the time
    // that timeout fires, setIndex has already run and `current` in this
    // closure would still point at the pick being cycled away FROM, not
    // the one being cycled TO. (Bug fixed here: the badge was showing a
    // stuck "0% match" after every cycle because displayPercent was reset
    // to 0 for the sweep but nothing ever set it back afterward.)
    const nextIndex = (index + 1) % picks.length;
    const nextPercent = picks[nextIndex].matchPercent;
    setPhase("sweeping");
    setDisplayPercent(0);
    timers.current.push(
      setTimeout(() => setIndex(nextIndex), CYCLE_SWAP_MS),
      setTimeout(() => {
        setDisplayPercent(nextPercent ?? 0);
        setPhase("revealed");
      }, SWEEP_MS)
    );
  }

  const { title, reason, detail, matchPercent, director } = current;
  const year = title.release_date?.slice(0, 4);
  const meta = [year, formatRuntime(title.runtime_minutes), director].filter(Boolean).join(" · ");
  const backdropImage = title.backdrop_url ?? title.poster_url;
  const href = `/movie/${title.id}`;
  const revealed = phase === "revealed";
  const meterActive = phase === "sealed" || phase === "revealing";

  // Sealed: full blur, empty ring. Revealing: blur target flips to 0 so
  // the CSS transition below carries it there over METER_MS, exactly
  // alongside the ring filling and the number counting up. Revealed /
  // sweeping: stays clear.
  const blurPx = phase === "sealed" ? MAX_BLUR_PX : 0;
  const ringPercent = phase === "sealed" ? 0 : displayPercent;
  const ringOffset = RING_CIRCUMFERENCE * (1 - Math.min(ringPercent, 100) / 100);

  return (
    // Dramatically taller than the old 368/440px card, and no longer
    // paired 1.6fr/1fr next to HiddenGemCard (see page.tsx) -- the AI
    // recommendation is Marquee's whole differentiator, so this is now
    // the unambiguous focal point of the page: full column width, the
    // tallest single element on the home page by a wide margin, with
    // everything else (mood row, social feed, hidden gem) demoted below
    // it at a visibly smaller, quieter scale.
    <div className="relative h-[480px] overflow-hidden rounded-[var(--radius-sm)] border border-border bg-surface-raised sm:h-[600px] lg:h-[680px]">
      {/* Modernization pass (flattened direction): corner radius sharpened
          from --radius-lg (14px) to --radius-sm (6px), and the decorative
          gold-foil/glow treatments below (badge, title glow, polish-sweep
          shine, CTA gloss shadow) are gone -- closer to a current flat-
          chrome streaming-app look than the earlier velvet-and-foil
          identity. Scoped to this component (home hero) only -- .bg-
          gold-foil itself is untouched since it's shared by buttons
          sitewide (nav login, signup, premium, etc.) that weren't part
          of this pass. */}
      {backdropImage && (
        <Link
          href={href}
          className="absolute inset-0"
          tabIndex={revealed ? undefined : -1}
          aria-hidden={!revealed}
        >
          <Image
            src={backdropImage}
            alt=""
            fill
            priority
            className="object-cover transition-[filter,transform] duration-[1400ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{
              filter: `blur(${blurPx}px) grayscale(0.15) brightness(0.75)`,
              // Scaled up while blurred so the heavy blur radius doesn't
              // sample past the image's own edge into the container's
              // empty padding (which reads as a faint soft halo at the
              // border) -- settles back to 1 in step with the blur
              // clearing.
              transform: phase === "sealed" ? "scale(1.08)" : "scale(1)",
            }}
            sizes="(max-width: 1024px) 100vw, 60vw"
          />
        </Link>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/25 to-background/45" />
      {revealed && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-background via-background/80 to-transparent" />
      )}

      {meterActive && (
        <button
          type="button"
          onClick={reveal}
          disabled={phase !== "sealed"}
          aria-label="Tap to generate tonight's recommendation"
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 text-center"
        >
          <div className="relative flex h-24 w-24 items-center justify-center text-accent">
            <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90">
              <circle cx="48" cy="48" r={RING_RADIUS} fill="none" stroke="currentColor" strokeOpacity="0.16" strokeWidth="3" />
              <circle
                cx="48"
                cy="48"
                r={RING_RADIUS}
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                style={{
                  strokeDasharray: RING_CIRCUMFERENCE,
                  strokeDashoffset: ringOffset,
                  transition: "stroke-dashoffset 1400ms cubic-bezier(0.16,1,0.3,1)",
                }}
              />
            </svg>
            <span className="absolute font-display text-xl text-foreground tabular-nums">
              {hasMatch ? `${ringPercent}%` : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <path d="M12 3v3M12 18v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M3 12h3M18 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" strokeLinecap="round" />
                </svg>
              )}
            </span>
          </div>
          <span>
            <span className="font-display block text-xl text-foreground sm:text-2xl">
              {isColdStart ? "A pick is ready" : "Tonight's pick is ready"}
            </span>
            <span className="mt-1 block text-[11px] uppercase tracking-wider text-foreground-muted">
              {phase === "sealed" ? "Tap to calculate tonight's match" : "Calculating your match…"}
            </span>
          </span>
        </button>
      )}

      {revealed && (
        <div className="reveal-glow absolute inset-x-0 bottom-0 p-5 sm:p-8">
          {/* Badge + meta share one baseline-aligned line instead of
              the match% pill floating in a separate row below the
              title -- cleaner reading order: what is it, is it a good
              match, then the title itself gets its own full-size line
              with nothing competing on it. */}
          <div className="reveal-fade-up flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            {matchPercent !== null && (
              <span className="bg-accent text-accent-foreground rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-bold tracking-wide">
                {displayPercent}% MATCH
              </span>
            )}
            {meta && <span className="text-xs text-foreground-muted">{meta}</span>}
            {title.genres?.[0] && (
              <span className="text-xs uppercase tracking-wider text-accent-soft">{title.genres[0]}</span>
            )}
          </div>

          <Link href={href} className="block">
            <h2 className="font-display reveal-fade-up mt-2 text-3xl leading-[1.08] text-foreground [animation-delay:60ms] sm:text-5xl">
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

          {/* Streaming-home CTA pair (Concept G) -- replaces the old
              single "Watch tonight" button, which just linked to the
              same movie page the poster/title already link to. Primary
              is now a real distinct action (queue it up) rather than a
              second route to the page you're already looking at;
              secondary is the plain "more info" link that used to be
              the only CTA. Both keep the same h-12/px-7/radius-sm
              sizing as the old single button so the reveal layout
              doesn't shift. */}
          <div className="reveal-fade-up mt-5 flex flex-wrap items-center gap-3 [animation-delay:210ms]">
            <button
              type="button"
              onClick={toggleWatchlist}
              disabled={isWatchlistPending}
              className={
                onWatchlist
                  ? "inline-flex h-12 items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-border-strong bg-white/5 px-7 text-sm font-semibold uppercase tracking-wide text-accent transition-colors hover:bg-white/10 disabled:opacity-60"
                  : "bg-accent text-accent-foreground inline-flex h-12 items-center justify-center gap-2 rounded-[var(--radius-sm)] px-7 text-sm font-semibold uppercase tracking-wide transition-colors hover:bg-accent-soft disabled:opacity-60"
              }
            >
              <Bookmark size={15} fill={onWatchlist ? "currentColor" : "none"} />
              {onWatchlist ? "On watchlist" : "Add to watchlist"}
            </button>
            <Link
              href={href}
              className="inline-flex h-12 items-center justify-center rounded-[var(--radius-sm)] border border-border-strong bg-white/5 px-7 text-sm font-semibold uppercase tracking-wide text-foreground transition-colors hover:bg-white/10"
            >
              More info
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
      )}
    </div>
  );
}
