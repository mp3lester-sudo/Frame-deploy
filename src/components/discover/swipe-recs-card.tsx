"use client";

import { useRef, useState } from "react";
import Image from "@/components/ui/fade-image";
import { X, Heart } from "lucide-react";
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
  const [deck, setDeck] = useState(initialDeck);
  const [index, setIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [exitDirection, setExitDirection] = useState<ExitDirection>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const pointerRef = useRef<{ startX: number; startY: number; active: boolean }>({
    startX: 0,
    startY: 0,
    active: false,
  });

  const current = deck[index];
  const next = deck[index + 1];

  function decide(direction: "left" | "right") {
    if (!current || exitDirection) return;
    setExitDirection(direction);
    if (direction === "left") {
      void dismissRecommendation(current.id);
    } else {
      void addToWatchlist(current.id);
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
    if (dragOffset.x > SWIPE_THRESHOLD) decide("right");
    else if (dragOffset.x < -SWIPE_THRESHOLD) decide("left");
    else setDragOffset({ x: 0, y: 0 });
  }

  if (deck.length === 0) return null;

  // Ran through the whole batch -- rather than silently rendering nothing
  // (which would read as broken) or auto-fetching forever, a clear
  // completion state that lets someone re-open a fresh batch on demand.
  if (!current) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-border bg-glass p-6 text-center">
        <p className="font-display text-lg">You&apos;re all caught up</p>
        <p className="mt-1 text-xs text-foreground-muted">Swiped through this batch of picks.</p>
        <button
          type="button"
          onClick={() => {
            setIndex(0);
            setDeck((d) => [...d].sort(() => Math.random() - 0.5));
          }}
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
          <Image
            src={current.posterUrl}
            alt={current.name}
            fill
            priority={!isFullscreenVariant}
            sizes="(max-width: 640px) 220px, 384px"
            className="pointer-events-none object-cover"
            onClick={() => {
              // A tap (not a drag) on the poster itself opens the
              // full-screen session -- pass/watchlist pills below stay
              // reachable in the compact view without triggering this.
              if (!isFullscreenVariant && Math.abs(dragOffset.x) < 4 && Math.abs(dragOffset.y) < 4) {
                setFullscreen(true);
              }
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-2 text-center text-xs font-semibold uppercase tracking-widest text-foreground-muted">
            {current.name}
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/10 to-transparent" />

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
          <p className="font-display text-xl">{current.name}</p>
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
        <p className="text-[11px] text-foreground-muted">Tap the poster to swipe through more</p>
      </div>
      <div className="mx-auto w-full max-w-[220px]">
        <div className="mb-2">{progressBar}</div>
        {cardBody(false)}
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
          <div className="mb-4">{progressBar}</div>
          <div className="flex flex-1 items-center justify-center">
            <div className="w-full max-w-sm">
              {cardBody(true)}
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
