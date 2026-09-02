"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "@/components/ui/fade-image";
import Link from "next/link";
import { Bookmark, Play } from "lucide-react";
import type { Database } from "@/lib/supabase/types";
import type { ReasonDetail } from "@/lib/recommendations/explain";
import type { MediaType } from "@/lib/context/media-type-cookie";
import { BANNER_DUOTONE_FILTER } from "@/lib/design/duotone";
import { addToWatchlist, removeFromWatchlist } from "@/lib/actions/lists";

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

// Tap-to-reveal: "Kinetic Numerals" -- a huge ghost percentage fills the
// sealed card while the count-up runs, then snaps down into a small
// corner badge the instant it lands, handing the frame over to an
// oversized title. Replaces the earlier curtain-rise treatment (Concept
// M): same tap-gated mechanic and count-up animation underneath, but the
// visual event is now big confident type doing the work instead of
// theater-lobby set dressing (curtains/tassels/marquee bulbs), and the
// backdrop runs through the same BANNER_DUOTONE_FILTER recipe as the
// profile page's avatar backdrop so a real photo reads as "this app's
// palette" rather than whatever colors happen to be in that particular
// still.
const METER_MS = 1400;

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
 * home view: the hero pick starts sealed (blurred backdrop, no title
 * given away) and only reveals itself on tap, then offers a low-key
 * "Generate another pick" to cycle through a small reserve pool without
 * ever touching what MoodRow shows below it (see page.tsx -- `picks`
 * here is deliberately hero + a couple of reserve candidates that
 * MoodRow never renders, so cycling here can never duplicate a poster
 * already visible in "More picks for you").
 *
 * This was a deliberate product call, not just a visual one: the AI
 * recommendation is Slate's whole differentiator, and a fully-formed
 * card that's already on screen the instant the page paints reads as
 * decoration, not something that happened for you. Gating it behind a
 * tap -- with the match score visibly being calculated in between --
 * makes the same pick feel generated rather than merely displayed.
 */
export function RecommendationReveal({
  picks,
  isColdStart,
  mediaType,
}: {
  picks: RevealPick[];
  isColdStart: boolean;
  mediaType: MediaType;
}) {
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

  // Drives both the ghost numeral and, indirectly, when the meter
  // finishes -- setPhase("revealed") fires the instant the count-up
  // completes, so the number landing on its final value and the badge/
  // title swap happen in the same beat rather than one waiting on an
  // independent timer that could drift out of sync.
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
    // the one being cycled TO.
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

  // Rendition D's approved mockup pairs a plain gold percent line
  // directly with the title, instead of the boxed badge chip + separate
  // year/runtime/director meta row this hero used to show -- dropped
  // that secondary line entirely rather than squeezing it in somewhere
  // the approved static mockup never had it (see d.png).
  const { title, reason } = current;
  const backdropImage = title.backdrop_url ?? title.poster_url;
  const href = `/movie/${title.id}`;
  const revealed = phase === "revealed";
  const meterActive = phase === "sealed" || phase === "revealing";
  const matchLabel = hasMatch ? `${displayPercent}% match for you` : "Picked for you";

  return (
    // Redesign pass: dropped the hairline border + flat surface-raised
    // background that used to box this hero in like an ordinary card --
    // with a full backdrop image and gradient already filling every pixel,
    // that border read as a seam between "this app's chrome" and "the
    // photo," undercutting the cinematic full-bleed treatment the movie
    // detail page already does well (see movie/[id]/page.tsx's hero).
    // Bumped the corner radius up from --radius-sm to --radius-lg to match
    // -- a tight 6px cut felt like a UI element; 14px reads closer to a
    // poster card's own rounded corner.
    <div className="relative h-[480px] overflow-hidden rounded-[var(--radius-lg)] sm:h-[600px] lg:h-[680px]">
      {backdropImage && (
        <Link
          href={href}
          className="absolute inset-0"
          tabIndex={revealed ? undefined : -1}
          aria-hidden={!revealed}
        >
          {/* FadeImage below starts at opacity-0 until the backdrop
              actually decodes, which -- on a cold image-optimization
              cache or a slow connection -- can take several seconds. With
              nothing painted underneath, that read as a near-solid-black
              hero (this dark theme's own background showing through),
              easy to mistake for broken even though the tap-to-reveal
              button above is live the whole time. This shimmer sits
              behind it at the same inset-0/fill footprint so there's
              always something visibly "loading" rather than visibly
              nothing -- it's naturally covered the instant the image
              fades in on top of it. */}
          <div className="skeleton absolute inset-0" aria-hidden />
          {/* Same duotone recipe as the profile banner's avatar backdrop
              (see lib/design/duotone.ts) -- every real photo across the
              app now runs through one shared recipe, so a five-color
              TMDB still reads as "this app's palette" the same way here
              as it does there, instead of two different treatments that
              happen to both be gold-ish.

              Blurred while sealed/revealing (stacked onto the duotone
              filter, not a separate layer) -- with the old curtain
              panels gone, the backdrop itself is the only thing that
              could give the pick away before the tap, so the blur is
              what's actually doing the "sealed" work now. Clears with a
              transition the instant the count-up lands, same beat as
              the ghost numeral handing off to the badge. Scaled up
              slightly so the blurred edges never peek past the card's
              own rounded corners. */}
          <Image
            src={backdropImage}
            alt=""
            fill
            priority
            className="object-cover scale-105 transition-[filter] duration-700 ease-out"
            style={{ filter: `${BANNER_DUOTONE_FILTER[mediaType]} blur(${meterActive ? 16 : 0}px)` }}
            sizes="(max-width: 1024px) 100vw, 60vw"
          />
        </Link>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/25 to-background/45" />
      {revealed && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-background via-background/85 to-transparent" />
      )}

      {meterActive && (
        <button
          type="button"
          onClick={reveal}
          disabled={phase !== "sealed"}
          aria-label="Tap to generate tonight's recommendation"
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 text-center"
        >
          {/* Ghost numeral -- fills most of the card while sealed/
              revealing, gradient-faded from solid to translucent so it
              reads as a watermark rather than competing with the count-up
              itself. Snaps away the instant phase flips to "revealed",
              handed off to the small corner badge below. */}
          <span
            className="font-sans text-[92px] font-black leading-none tracking-tighter text-transparent sm:text-[130px] lg:text-[160px]"
            style={{
              backgroundImage: "linear-gradient(160deg, var(--foreground) 0%, rgba(242,233,223,0.15) 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
            }}
          >
            {hasMatch ? displayPercent : "＋"}
          </span>
          <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground-muted">
            {phase === "sealed"
              ? isColdStart
                ? "Tap for a pick"
                : "Tap for tonight's pick"
              : "Calculating your match…"}
          </span>
        </button>
      )}

      {/* Revealed content: matches rendition D's approved mockup
          (d.png) element-for-element -- gold match line, italic serif
          title, reason line, ghost "Press play" pill -- centered rather
          than the earlier left-aligned block, since that's how the
          mockup composes it. The tap-to-reveal meter above is the one
          thing the mockup (a static image) couldn't show and the user
          explicitly asked to keep, so it still gates this exact content
          rather than replacing it outright. */}
      {revealed && (
        <div className="reveal-glow absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-6 text-center sm:gap-4 sm:p-10">
          <span className="reveal-fade-up text-gold-foil font-sans text-[11px] font-bold uppercase tracking-[0.25em]">
            {matchLabel}
          </span>

          <Link href={href}>
            <h2 className="reveal-fade-up font-display text-4xl italic leading-[1.05] text-foreground [animation-delay:60ms] sm:text-6xl">
              {title.name}
            </h2>
          </Link>

          <p className="reveal-fade-up max-w-md text-sm leading-relaxed text-foreground-muted [animation-delay:110ms] sm:text-base">
            {reason}
          </p>

          <Link
            href={href}
            className="reveal-fade-up mt-2 inline-flex items-center gap-2 rounded-[var(--radius-full)] border border-white/25 bg-black/35 px-6 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground backdrop-blur-md transition-colors [animation-delay:160ms] hover:border-accent/50 hover:bg-black/50"
          >
            <Play size={12} fill="currentColor" />
            Press play
          </Link>

          {picks.length > 1 && (
            <button
              type="button"
              onClick={generateAnother}
              className="reveal-fade-up mt-1 text-xs text-foreground-muted transition-colors [animation-delay:210ms] hover:text-accent"
            >
              Not feeling it? Generate another pick
            </button>
          )}
        </div>
      )}

      {/* Watchlist toggle -- not part of the mockup's focal content (a
          static image has no room for secondary chrome), but real,
          already-wired functionality worth keeping reachable rather than
          silently dropping. Tucked in the corner, out of the way of the
          centered content the mockup actually specifies. */}
      {revealed && (
        <button
          type="button"
          onClick={toggleWatchlist}
          disabled={isWatchlistPending}
          aria-label={onWatchlist ? "Remove from watchlist" : "Add to watchlist"}
          aria-pressed={onWatchlist}
          className={
            onWatchlist
              ? "reveal-fade-up bg-accent text-accent-foreground absolute right-4 top-4 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-accent-soft disabled:opacity-60 sm:right-6 sm:top-6"
              : "reveal-fade-up absolute right-4 top-4 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-border-strong bg-white/5 text-foreground backdrop-blur-md transition-colors hover:bg-white/10 disabled:opacity-60 sm:right-6 sm:top-6"
          }
        >
          <Bookmark size={16} fill={onWatchlist ? "currentColor" : "none"} />
        </button>
      )}
    </div>
  );
}
