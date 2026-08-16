"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "@/components/ui/fade-image";
import { X, Heart, Maximize2 } from "lucide-react";
import { dismissRecommendation } from "@/lib/actions/dismissals";
import { addToWatchlist } from "@/lib/actions/lists";
import type { SwipeRec } from "@/lib/actions/swipe-recs";

// Same feel as the onboarding taste-training deck (see
// onboarding-swipe.tsx) -- same threshold, same rotation-from-drag
// formula, same exit distance/easing -- so "swipe on a movie card"
// reads as one consistent gesture across the app rather than two
// slightly-different implementations. Not literally imported from there
// since this deck's card chrome (match %, reason, pass/watchlist instead
// of pass/love-it) and full-screen presentation are different enough to
// not share a component cleanly.
const SWIPE_THRESHOLD = 110;
const EXIT_DURATION_MS = 260;
const ENTER_DURATION_MS = 340;

// "It's a Match" toast -- tuned way down from the full-screen takeover
// concept it started as: no confetti, no collision graphic, no stopping
// the deck's momentum. Right-swiping (watchlist-add) a card whose
// matchPercent clears this bar gets a brief, non-blocking banner
// instead, reusing the Kinetic Numerals gold-gradient treatment already
// shipped on the home hero reveal so it reads as the same design
// language rather than a new one-off. The card still exits and the next
// one enters on the usual timers underneath it; the toast just floats
// on top for a moment and clears itself.
const MATCH_THRESHOLD = 85;
const MATCH_TOAST_MS = 1800;

type ExitDirection = "left" | "right" | null;

/**
 * "More like this" -- a compact card (rendition B from the earlier
 * mockups) sitting inline in Discover. Tapping the poster itself (not
 * the pass/watchlist pills) expands it into a full-screen swipe session
 * over the same deck, so someone who wants to plow through several picks
 * in a row can, without the compact card permanently taking over the
 * page for people who just glance at one pick and move on.
 *
 * Left swipe/pass -> dismissRecommendation (title_dismissals, migration
 * 0066) -- a hard "don't recommend again," never shown to this user
 * again. Right swipe/heart -> addToWatchlist, the same action the movie
 * page's own watchlist button already calls. Neither action revalidates
 * this page (see the comment in dismissals.ts) -- the deck only ever
 * needs its own local state to stay smooth, swipe after swipe.
 */
export function SwipeRecsCard({ initialDeck }: { initialDeck: SwipeRec[] }) {
  const router = useRouter();
  const [deck, setDeck] = useState(initialDeck);
  const [index, setIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [exitDirection, setExitDirection] = useState<ExitDirection>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [matchToast, setMatchToast] = useState<SwipeRec | null>(null);
  // Every right-swiped card that cleared MATCH_THRESHOLD this session --
  // feeds the session-recap end state below instead of vanishing once
  // the toast clears itself.
  const [matches, setMatches] = useState<SwipeRec[]>([]);
  const pointerRef = useRef<{ startX: number; startY: number; active: boolean }>({
    startX: 0,
    startY: 0,
    active: false,
  });

  const current = deck[index];
  const next = deck[index + 1];

  // A plain next/link inside this card turned out unreliable -- the
  // card root has touch-action: none plus its own onPointerDown that
  // calls setPointerCapture (needed for the drag gesture), and on at
  // least some WebKit builds that combination can eat the tap before
  // the anchor's own click ever synthesizes, especially over a single
  // quick tap with no measurable movement. Driving navigation through
  // router.push from an explicit onClick, with propagation stopped at
  // every pointer stage (not just pointerdown), sidesteps the ambiguity
  // entirely instead of hoping the browser resolves tap-vs-drag-target
  // the way an ordinary link expects.
  function goToMovie(e: React.SyntheticEvent, id: string) {
    e.stopPropagation();
    router.push(`/movie/${id}`);
  }

  function decide(direction: "left" | "right") {
    if (!current || exitDirection) return;
    setExitDirection(direction);
    if (direction === "left") {
      void dismissRecommendation(current.id);
    } else {
      void addToWatchlist(current.id);
      if (current.matchPercent !== null && current.matchPercent >= MATCH_THRESHOLD) {
        setMatchToast(current);
        setMatches((m) => [...m, current]);
        window.setTimeout(() => setMatchToast(null), MATCH_TOAST_MS);
      }
    }
    window.setTimeout(() => {
      setIndex((i) => i + 1);
      setExitDirection(null);
      setDragOffset({ x: 0, y: 0 });
    }, EXIT_DURATION_MS);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (exitDirection) return;
    pointerRef.current = { startX: e.clientX, startY: e.clientY, active: true };
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointerRef.current.active) return;
    setDragOffset({ x: e.clientX - pointerRef.current.startX, y: e.clientY - pointerRef.current.startY });
  }

  function endDrag() {
    if (!pointerRef.current.active) return;
    pointerRef.current.active = false;
    setIsDragging(false);
    if (dragOffset.x > SWIPE_THRESHOLD) {
      decide("right");
      return;
    }
    if (dragOffset.x < -SWIPE_THRESHOLD) {
      decide("left");
      return;
    }
    // Didn't cross the swipe threshold -- if the pointer barely moved at
    // all, this was a tap on the poster rather than an abandoned drag,
    // so send it straight to the movie page instead of just snapping
    // back to center. Same 4px tolerance the title/fallback buttons
    // already use for their own tap-vs-drag check below.
    if (Math.abs(dragOffset.x) < 4 && Math.abs(dragOffset.y) < 4 && current) {
      router.push(`/movie/${current.id}`);
    }
    setDragOffset({ x: 0, y: 0 });
  }

  if (deck.length === 0) return null;

  // Ran through the whole batch -- rather than silently rendering nothing
  // (which would read as broken) or auto-fetching forever, a clear
  // completion state that lets someone re-open a fresh batch on demand.
  if (!current) {
    function reshuffle() {
      setIndex(0);
      setMatches([]);
      setDeck((d) => [...d].sort(() => Math.random() - 0.5));
    }

    // Session recap -- Concept 3 from the match-deck renderings. Only
    // shown when at least one card cleared MATCH_THRESHOLD this batch;
    // otherwise falls through to the plain caught-up card below so a
    // batch with no strong matches doesn't pretend it had one.
    if (matches.length > 0) {
      const sorted = [...matches].sort((a, b) => (b.matchPercent ?? 0) - (a.matchPercent ?? 0));
      const best = sorted[0];
      const rest = sorted.slice(1, 3);
      return (
        <div className="rounded-[var(--radius-lg)] border border-border bg-glass p-5">
          <p className="text-[10px] uppercase tracking-wider text-foreground-muted">You&apos;re all caught up</p>
          <p className="mt-1 font-display text-lg">
            {matches.length === 1 ? "Tonight's match" : "Tonight's top match"}
          </p>
          <div className="relative mt-3 overflow-hidden rounded-[var(--radius-md)]" style={{ aspectRatio: "16/9" }}>
            {(best.backdropUrl ?? best.posterUrl) && (
              <Image src={(best.backdropUrl ?? best.posterUrl)!} alt="" fill className="object-cover" />
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
            <div
              className="absolute left-3 top-3 rounded-[var(--radius-full)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-accent-foreground"
              style={{ backgroundImage: "var(--accent-gradient)" }}
            >
              Best match
            </div>
            <div className="absolute inset-x-3 bottom-3">
              <p className="font-hollywood text-3xl leading-none text-gold-foil">{best.matchPercent}%</p>
              <p className="font-display text-lg text-foreground">{best.name}</p>
            </div>
          </div>
          {rest.length > 0 && (
            <div className="mt-3 space-y-2">
              {rest.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-2.5 rounded-[var(--radius-md)] border border-border bg-surface px-2.5 py-2"
                >
                  {m.posterUrl && (
                    <div className="relative h-11 w-8 shrink-0 overflow-hidden rounded-[var(--radius-sm)]">
                      <Image src={m.posterUrl} alt="" fill className="object-cover" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{m.name}</p>
                    <p className="text-gold-foil text-[10px]">{m.matchPercent}% match</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => router.push("/movie-night")}
              className="bg-gold-foil text-accent-foreground inline-flex h-10 items-center justify-center rounded-[var(--radius-full)] px-5 text-xs font-semibold uppercase tracking-wide shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_8px_20px_-8px_rgba(205,166,70,0.55)] transition-[filter] hover:brightness-110"
            >
              Start a Movie Night with these
            </button>
            <button
              type="button"
              onClick={reshuffle}
              className="inline-flex h-9 items-center justify-center rounded-[var(--radius-full)] border border-border-strong px-5 text-xs font-medium uppercase tracking-wide text-foreground-muted"
            >
              Shuffle & replay
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-[var(--radius-lg)] border border-border bg-glass p-6 text-center">
        <p className="font-display text-lg">You&apos;re all caught up</p>
        <p className="mt-1 text-xs text-foreground-muted">Swiped through this batch of picks.</p>
        <button
          type="button"
          onClick={reshuffle}
          className="bg-gold-foil text-accent-foreground mt-4 inline-flex h-9 items-center justify-center rounded-[var(--radius-full)] px-5 text-xs font-semibold uppercase tracking-wide shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_8px_20px_-8px_rgba(205,166,70,0.55)] transition-[filter] hover:brightness-110"
        >
          Shuffle & replay
        </button>
      </div>
    );
  }

  const rotation = exitDirection === "left" ? -16 : exitDirection === "right" ? 16 : dragOffset.x / 16;
  const translateX = exitDirection === "left" ? -560 : exitDirection === "right" ? 560 : dragOffset.x;
  const translateY = isDragging ? dragOffset.y * 0.35 : 0;
  // A slight lift while dragging -- the card grows by up to 3% as it's
  // pulled toward either edge, a small physical cue (like picking a real
  // card up off a stack) that reinforces the drag is being tracked, on
  // top of the Pass/Watchlist stamps fading in.
  const dragScale = isDragging ? 1 + Math.min(Math.abs(dragOffset.x) / 4000, 0.03) : 1;
  const cardOpacity = exitDirection ? 0 : 1;
  const saveOpacity = exitDirection === "right" ? 1 : exitDirection ? 0 : Math.min(Math.max(dragOffset.x / 90, 0), 1);
  const passOpacity = exitDirection === "left" ? 1 : exitDirection ? 0 : Math.min(Math.max(-dragOffset.x / 90, 0), 1);

  const cardTransform = `translate(${translateX}px, ${translateY}px) rotate(${rotation}deg) scale(${dragScale})`;
  const cardTransition = isDragging
    ? "none"
    : `transform ${EXIT_DURATION_MS}ms cubic-bezier(0.2,0.8,0.2,1), opacity ${EXIT_DURATION_MS}ms ease-out`;

  // Tuned-down match banner -- gold-gradient "MATCH" wordmark (same
  // gradient-text technique as the home hero's Kinetic Numerals) plus
  // the percentage and title, nothing else. Floats over whichever card
  // surface is currently visible and clears itself on a timer; never
  // blocks a tap or the next swipe.
  const matchToastEl = matchToast ? (
    <div
      key={matchToast.id}
      className="toast-enter pointer-events-none absolute inset-x-2 top-2 z-20 flex items-center gap-1.5 overflow-hidden rounded-[var(--radius-md)] border border-accent/40 bg-background/90 px-3 py-1.5 shadow-[0_12px_30px_-10px_rgba(0,0,0,0.65)] backdrop-blur-md"
    >
      <span
        className="font-hollywood shrink-0 text-xs tracking-[0.1em]"
        style={{
          backgroundImage: "var(--accent-gradient)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        MATCH
      </span>
      <span className="text-gold-foil shrink-0 text-[11px] font-semibold">{matchToast.matchPercent}%</span>
      <span className="truncate text-[11px] text-foreground-muted">{matchToast.name}</span>
    </div>
  ) : null;

  const cardBody = (isFullscreenVariant: boolean) => (
    // Keyed on the title id so every new card is a genuinely fresh DOM
    // node -- lets swipe-card-enter (below) run a clean, guaranteed
    // "this is a new pick" animation instead of inheriting whatever
    // transform the previous, now-exited card happened to be sitting at.
    <div key={current.id} className="swipe-card-enter">
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={`relative w-full cursor-grab touch-none select-none overflow-hidden rounded-[var(--radius-lg)] bg-black active:cursor-grabbing ${
          isFullscreenVariant ? "h-[62vh]" : "aspect-[3/4]"
        }`}
        style={{ transform: cardTransform, opacity: cardOpacity, transition: cardTransition }}
      >
        {/* Next card underneath, peeking out -- signals there's more in the
            deck without needing separate progress UI. */}
        {next && (
          <div className="absolute inset-2 -z-10 scale-[0.96] rounded-[var(--radius-lg)] bg-black opacity-60">
            {next.posterUrl && (
              <Image src={next.posterUrl} alt="" fill className="rounded-[var(--radius-lg)] object-cover" />
            )}
          </div>
        )}
        {/* Shimmering placeholder, always rendered behind the poster --
            fade-image's own fade-in already smooths the pop-in once the
            image decodes, but until then this reads as "loading" rather
            than a flat black rectangle. No loaded-state tracking needed:
            the poster paints directly on top and simply covers it. */}
        <div className="swipe-card-shimmer absolute inset-0" />
        {current.posterUrl ? (
          // Tap-to-navigate for this whole region is handled by endDrag
          // above (a release with near-zero movement) -- this stays a
          // plain, non-interactive layer so it never competes with the
          // card's own onPointerDown/onPointerUp a few lines up for the
          // same gesture. Opening the full-screen swipe session used to
          // live here too, still reachable via the small expand icon in
          // the corner instead (see below).
          <Image
            src={current.posterUrl}
            alt=""
            fill
            priority={!isFullscreenVariant}
            sizes="(max-width: 640px) 220px, 384px"
            className="pointer-events-none object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-2 text-center text-xs font-semibold uppercase tracking-widest text-foreground-muted">
            {current.name}
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/10 to-transparent" />

        {/* Full-screen swipe session used to open on any poster tap --
            now that the poster goes straight to the movie page instead,
            this small corner button is the dedicated way in for anyone
            who wants to plow through the rest of the deck immediately. */}
        {!isFullscreenVariant && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setFullscreen(true);
            }}
            aria-label="Swipe through more picks"
            style={{ touchAction: "manipulation" }}
            className="pointer-events-auto absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
          >
            <Maximize2 size={14} />
          </button>
        )}

        <div
          className="font-hollywood pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 -rotate-12 rounded-[var(--radius-sm)] border-2 border-danger px-3 py-1 text-lg uppercase tracking-[0.1em] text-danger"
          style={{ opacity: passOpacity }}
        >
          Pass
        </div>
        <div
          className="text-gold-foil font-hollywood pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 rotate-12 rounded-[var(--radius-sm)] border-2 border-accent px-3 py-1 text-lg uppercase tracking-[0.1em]"
          style={{ opacity: saveOpacity }}
        >
          Watchlist
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4">
          {current.matchPercent !== null && (
            <span className="mb-1.5 inline-block rounded-[var(--radius-full)] border border-accent/40 bg-accent/15 px-2.5 py-0.5 text-[11px] font-semibold text-gold-foil">
              {current.matchPercent}% Match
            </span>
          )}
          {/* Title is the one interactive element in an otherwise
              pointer-events-none overlay (see the wrapping div) -- tapping
              it jumps straight to the movie page instead of requiring
              someone to first open fullscreen, find the poster, and know
              a tap there does something different (opens the swipe
              session, not the title). Propagation is stopped at every
              pointer stage, not just click, so the card's own drag
              handling (which starts from onPointerDown a few levels up)
              never sees this tap at all -- see goToMovie's comment. */}
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => goToMovie(e, current.id)}
            style={{ touchAction: "manipulation" }}
            className="pointer-events-auto block bg-transparent p-0 text-left font-display text-xl underline-offset-4 hover:underline"
          >
            {current.name}
          </button>
          <p className="mt-0.5 text-[11px] text-foreground-muted">
            {[current.releaseYear, current.genres.slice(0, 2).join(", ")].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-2 border-l-2 border-accent/50 pl-2 text-[11px] leading-relaxed text-foreground-muted">
            {current.reason}
          </p>
        </div>
      </div>
    </div>
  );

  // Alignment meter -- a thin, always-visible gauge of the *current*
  // card's matchPercent (not a session aggregate -- deliberately simple
  // and legible at a glance rather than another number to interpret).
  // Concept 2 from the match-deck renderings, kept in regardless of
  // which reveal concept shipped: cheap, persistent proof that the
  // engine is scoring every card in real time, independent of whether
  // any single swipe clears the match-toast threshold. Reflects
  // `current` automatically on every card change -- no extra state.
  const alignmentMeter =
    current.matchPercent !== null ? (
      <div className="mb-2">
        <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-foreground-muted">
          <span>Taste alignment</span>
          <span className="text-gold-foil font-semibold">{current.matchPercent}%</span>
        </div>
        <div className="h-[3px] overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full transition-[width] duration-500 ease-out"
            style={{ width: `${current.matchPercent}%`, backgroundImage: "var(--accent-gradient)" }}
          />
        </div>
      </div>
    ) : null;

  // Instagram-story-style segmented bar -- reads at a glance how far
  // through the batch this session is, and (unlike a "3 more" caption
  // alone) makes forward progress visible passively while swiping, not
  // just after stopping to read text.
  const progressBar = (
    <div className="flex gap-1">
      {deck.map((rec, i) => (
        <div key={rec.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gold-foil transition-[width] duration-300 ease-out"
            style={{ width: i < index ? "100%" : i === index ? "100%" : "0%" }}
          />
        </div>
      ))}
    </div>
  );

  const actionRow = (
    <div className="mt-4 flex items-center justify-center gap-4">
      <button
        type="button"
        onClick={() => decide("left")}
        aria-label="Don't recommend again"
        className="flex h-12 w-12 items-center justify-center rounded-full border border-danger/40 bg-danger/10 text-danger transition-transform hover:scale-105 active:scale-95"
      >
        <X size={20} />
      </button>
      <button
        type="button"
        onClick={() => decide("right")}
        aria-label="Add to watchlist"
        className="bg-gold-foil text-accent-foreground flex h-14 w-14 items-center justify-center rounded-full shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_8px_20px_-8px_rgba(205,166,70,0.55)] transition-transform hover:scale-105 active:scale-95"
      >
        <Heart size={22} fill="currentColor" />
      </button>
    </div>
  );

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <p className="font-display text-lg">More like this</p>
        <p className="text-[11px] text-foreground-muted">Tap to view &middot; drag to pass or save</p>
      </div>
      <div className="mx-auto w-full max-w-[220px]">
        {alignmentMeter}
        <div className="mb-2">{progressBar}</div>
        <div className="relative">
          {cardBody(false)}
          {matchToastEl}
        </div>
      </div>

      {fullscreen && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-background px-4 pb-6"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <div className="flex items-center justify-between py-3">
            <p className="font-display text-lg">More like this</p>
            <button
              type="button"
              onClick={() => setFullscreen(false)}
              aria-label="Close"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-glass text-foreground"
            >
              <X size={18} />
            </button>
          </div>
          {alignmentMeter}
          <div className="mb-4">{progressBar}</div>
          <div className="flex flex-1 items-center justify-center">
            <div className="w-full max-w-sm">
              <div className="relative">
                {cardBody(true)}
                {matchToastEl}
              </div>
              {actionRow}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes swipe-card-enter {
          from { opacity: 0; transform: scale(0.94) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .swipe-card-enter {
          animation: swipe-card-enter ${ENTER_DURATION_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }
        @keyframes swipe-card-shimmer-move {
          0% { background-position: -150% 0; }
          100% { background-position: 150% 0; }
        }
        .swipe-card-shimmer {
          background: linear-gradient(
            100deg,
            rgba(255, 255, 255, 0.02) 30%,
            rgba(217, 184, 118, 0.08) 50%,
            rgba(255, 255, 255, 0.02) 70%
          );
          background-size: 200% 100%;
          animation: swipe-card-shimmer-move 1.6s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
