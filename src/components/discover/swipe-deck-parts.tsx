"use client";

import Image from "@/components/ui/fade-image";
import { Heart, X } from "lucide-react";
import type { SwipeRec } from "@/lib/actions/swipe-recs";

/**
 * Split out of swipe-recs-card.tsx (chores #837 -- that file had grown to
 * 705 lines by mixing the drag/gesture engine with several fully
 * self-contained presentational pieces). Everything here is pure/stateless
 * -- no drag state, no timers, no refs -- so it lifts out cleanly with zero
 * behavior change. The core pointer/transform/exit-animation logic stays in
 * swipe-recs-card.tsx: that part genuinely is one tightly-coupled unit
 * (see the comments there on why cardRef/justSwapped/dragOffset all have
 * to live together), and splitting it further would mean prop-drilling a
 * dozen values across files for no real safety or readability win.
 */

/** "It's a Match" toast -- floats over whichever card surface is visible. */
export function MatchToast({ match }: { match: SwipeRec | null }) {
  if (!match) return null;
  return (
    <div
      key={match.id}
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
      <span className="text-gold-foil shrink-0 text-[11px] font-semibold">{match.matchPercent}%</span>
      <span className="truncate text-[11px] text-foreground-muted">{match.name}</span>
    </div>
  );
}

/** Pass / Watchlist button pair shown in the fullscreen swipe session. */
export function SwipeActionRow({ onPass, onSave }: { onPass: () => void; onSave: () => void }) {
  return (
    <div className="mt-4 flex items-center justify-center gap-4">
      <button
        type="button"
        onClick={onPass}
        aria-label="Don't recommend again"
        className="flex h-12 w-12 items-center justify-center rounded-full border border-danger/40 bg-danger/10 text-danger transition-transform hover:scale-105 active:scale-95"
      >
        <X size={20} />
      </button>
      <button
        type="button"
        onClick={onSave}
        aria-label="Add to watchlist"
        className="bg-gold-foil text-accent-foreground flex h-14 w-14 items-center justify-center rounded-full shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_8px_20px_-8px_rgba(205,166,70,0.55)] transition-transform hover:scale-105 active:scale-95"
      >
        <Heart size={22} fill="currentColor" />
      </button>
    </div>
  );
}

/**
 * "You're all caught up" end state, reached once `index` runs past the end
 * of the deck. Two variants: a session recap (Concept 3 from the
 * match-deck renderings) when at least one card cleared MATCH_THRESHOLD
 * this batch, otherwise a plain caught-up card so a batch with no strong
 * matches doesn't pretend it had one.
 */
export function SwipeDeckCaughtUp({
  matches,
  onReshuffle,
  onStartMovieNight,
}: {
  matches: SwipeRec[];
  onReshuffle: () => void;
  onStartMovieNight: () => void;
}) {
  if (matches.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-border bg-glass p-6 text-center">
        <p className="font-display text-lg">You&apos;re all caught up</p>
        <p className="mt-1 text-xs text-foreground-muted">Swiped through this batch of picks.</p>
        <button
          type="button"
          onClick={onReshuffle}
          className="bg-gold-foil text-accent-foreground mt-4 inline-flex h-9 items-center justify-center rounded-[var(--radius-full)] px-5 text-xs font-semibold uppercase tracking-wide shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_8px_20px_-8px_rgba(205,166,70,0.55)] transition-[filter] hover:brightness-110"
        >
          Shuffle & replay
        </button>
      </div>
    );
  }

  const sorted = [...matches].sort((a, b) => (b.matchPercent ?? 0) - (a.matchPercent ?? 0));
  const best = sorted[0];
  const rest = sorted.slice(1, 3);

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-glass p-5">
      <p className="text-[10px] uppercase tracking-wider text-foreground-muted">You&apos;re all caught up</p>
      <p className="mt-1 font-display text-lg">{matches.length === 1 ? "Tonight's match" : "Tonight's top match"}</p>
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
          onClick={onStartMovieNight}
          className="bg-gold-foil text-accent-foreground inline-flex h-10 items-center justify-center rounded-[var(--radius-full)] px-5 text-xs font-semibold uppercase tracking-wide shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_8px_20px_-8px_rgba(205,166,70,0.55)] transition-[filter] hover:brightness-110"
        >
          Start a Movie Night with these
        </button>
        <button
          type="button"
          onClick={onReshuffle}
          className="inline-flex h-9 items-center justify-center rounded-[var(--radius-full)] border border-border-strong px-5 text-xs font-medium uppercase tracking-wide text-foreground-muted"
        >
          Shuffle & replay
        </button>
      </div>
    </div>
  );
}
