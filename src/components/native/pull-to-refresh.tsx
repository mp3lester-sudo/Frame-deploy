"use client";

import { useEffect, useRef, useState } from "react";
import { isNativeApp } from "@/lib/native/is-native";

const PULL_THRESHOLD = 72; // px of (resisted) pull before a release triggers a reload
const MAX_PULL = 110; // px -- caps how far the indicator can travel

/**
 * The native iOS app has no browser chrome at all -- no address bar, no
 * pull-to-refresh affordance, nothing -- so once a screen is stuck (a
 * failed fetch, a stale session after backgrounding overnight, etc.)
 * there was previously no way to reload short of force-quitting the app
 * from the iOS app switcher. This adds the standard "pull down from the
 * top of the page" gesture, reloading the WKWebView the same way a
 * plain browser refresh would.
 *
 * Deliberately native-app-only (isNativeApp() gate below): the ordinary
 * website already runs inside a real browser that has its own
 * pull-to-refresh (mobile Safari/Chrome) or none at all by design
 * (desktop) -- adding a second, custom one there would just fight the
 * browser's own gesture instead of filling a real gap.
 *
 * Only arms when the page is already scrolled fully to the top
 * (scrollY === 0), same rule real pull-to-refresh implementations use,
 * so this never hijacks an ordinary scroll-down-then-up gesture
 * mid-page.
 *
 * Also only arms for a gesture that's clearly vertical from the start.
 * This listens globally (window-level touch listeners, not scoped to
 * any particular element), so it sees every touch on the page --
 * including ones another component is already handling itself, like
 * SwipeRecsCard's left/right drag-to-decide gesture on Discover, which
 * sits right at the top of the page where scrollY is still 0. A
 * horizontal swipe there almost always carries some small incidental
 * vertical drift too, and without an axis check that drift alone was
 * enough to also arm this and, on release, fire its own reload --
 * completely unrelated to (and after) the actual card swipe. Locking
 * onto whichever axis dominates in the first ~8px of movement, and
 * simply not tracking the rest of that touch at all once it locks
 * horizontal, is the standard way native scroll views disambiguate
 * "this is a scroll" from "this is a horizontal swipe."
 */
export function PullToRefresh() {
  const [active, setActive] = useState(false);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const startX = useRef<number>(0);
  const axisLock = useRef<"vertical" | "horizontal" | null>(null);

  useEffect(() => {
    if (!isNativeApp()) return;

    function onTouchStart(e: TouchEvent) {
      axisLock.current = null;
      if (window.scrollY > 0) {
        startY.current = null;
        return;
      }
      startY.current = e.touches[0]?.clientY ?? null;
      startX.current = e.touches[0]?.clientX ?? 0;
    }

    function onTouchMove(e: TouchEvent) {
      if (startY.current === null || refreshing) return;
      const touch = e.touches[0];
      const deltaY = (touch?.clientY ?? 0) - startY.current;
      const deltaX = (touch?.clientX ?? 0) - startX.current;

      if (axisLock.current === null && (Math.abs(deltaY) > 8 || Math.abs(deltaX) > 8)) {
        axisLock.current = Math.abs(deltaY) > Math.abs(deltaX) ? "vertical" : "horizontal";
      }
      if (axisLock.current === "horizontal") {
        // Locked out for the rest of this touch -- a swipe that started
        // horizontal stays horizontal even if it later drifts vertical,
        // same as a real scroll-vs-swipe recognizer would treat it.
        setActive(false);
        setPull(0);
        return;
      }

      if (deltaY <= 0) {
        setActive(false);
        setPull(0);
        return;
      }
      if (deltaY > 8) {
        setActive(true);
        setPull(applyResistance(deltaY));
      }
    }

    function onTouchEnd() {
      if (startY.current === null) return;
      startY.current = null;
      if (axisLock.current === "vertical" && pull >= PULL_THRESHOLD && !refreshing) {
        setRefreshing(true);
        window.location.reload();
      } else {
        setActive(false);
        setPull(0);
      }
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [pull, refreshing]);

  if (!active && !refreshing) return null;

  const ready = pull >= PULL_THRESHOLD || refreshing;
  // Starts off-screen (-40px, above the safe-area-inset anchor below) and
  // slides down 1:1 with the (resisted) pull rather than just fading in
  // in place -- reads as something being physically pulled out from
  // behind the status bar, the standard pull-to-refresh feel, instead of
  // a badge that pops into existence partway down the screen.
  const progress = Math.min(pull / PULL_THRESHOLD, 1);
  const travel = refreshing ? 0 : -40 + 40 * progress;

  // A proper ring, not just a rotating icon: while dragging, the arc
  // fills in step with the pull (0 -> 100% of the ring's circumference)
  // so the gesture itself visibly "loads" the indicator -- the same
  // language as iOS's native UIRefreshControl and most native
  // pull-to-refresh implementations. Once armed/refreshing, it switches
  // to a fixed partial arc that spins continuously -- the standard
  // indeterminate-spinner look -- rather than continuing to track a
  // "progress" that no longer means anything once the reload has
  // actually been triggered.
  const RADIUS = 15;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const dashOffset = refreshing ? CIRCUMFERENCE * 0.75 : CIRCUMFERENCE * (1 - progress);

  const label = refreshing ? "Refreshing…" : ready ? "Release to refresh" : "Pull to refresh";

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-1.5"
      style={{ top: "calc(env(safe-area-inset-top) + 10px)" }}
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full shadow-lg backdrop-blur"
        style={{
          transform: `translateY(${travel}px) scale(${ready ? 1.05 : 0.88})`,
          opacity: progress,
          // The badge itself shifts from a neutral dark surface to a
          // warm gold-tinted one right at the arm threshold -- the same
          // "you can let go now" cue as a real UIRefreshControl's own
          // haptic tick, just rendered visually since there's no haptics
          // API available here.
          background: ready ? "rgba(217,184,118,0.16)" : "rgba(10,9,8,0.95)",
          border: ready ? "1px solid rgba(217,184,118,0.45)" : "1px solid transparent",
          transition: refreshing
            ? "transform 200ms ease-out, background 200ms ease-out, border-color 200ms ease-out"
            : "background 150ms ease-out, border-color 150ms ease-out",
        }}
      >
        <svg
          width="34"
          height="34"
          viewBox="0 0 34 34"
          className={refreshing ? "pull-refresh-spin" : ""}
          style={{ transform: refreshing ? undefined : `rotate(${-90 + progress * 270}deg)` }}
        >
          {/* Faint full-circle track so the ring reads clearly even at
              low pull distances, before much of the gold arc has
              filled in. */}
          <circle cx="17" cy="17" r={RADIUS} fill="none" stroke="rgba(217,184,118,0.18)" strokeWidth="3" />
          <circle
            cx="17"
            cy="17"
            r={RADIUS}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
          />
        </svg>
      </div>
      <span
        className="rounded-[var(--radius-full)] bg-background/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground-muted shadow backdrop-blur"
        style={{
          opacity: progress,
          transform: `translateY(${travel * 0.6}px)`,
          color: ready ? "var(--accent)" : undefined,
        }}
      >
        {label}
      </span>
      <style>{`
        .pull-refresh-spin {
          animation: pull-refresh-rotate 800ms linear infinite;
        }
        @keyframes pull-refresh-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// Rubber-band resistance: the first stretch of the drag (below the
// eventual PULL_THRESHOLD) tracks the finger almost 1:1, then
// progressively resists the further past that point someone pulls --
// the standard "you can keep pulling but it gets harder" feel every
// native pull-to-refresh uses, rather than a flat linear mapping that
// either arms too easily or requires an oddly long drag with no
// in-between feedback. Caps at MAX_PULL regardless of how far the raw
// finger travel goes, so the indicator never flies off past its own
// travel budget.
function applyResistance(rawDelta: number): number {
  if (rawDelta <= PULL_THRESHOLD) return rawDelta;
  const overshoot = rawDelta - PULL_THRESHOLD;
  const resisted = PULL_THRESHOLD + overshoot * 0.35;
  return Math.min(resisted, MAX_PULL);
}

