"use client";

import { useEffect, useRef, useState } from "react";
import { isNativeApp } from "@/lib/native/is-native";

const PULL_THRESHOLD = 72; // px of downward drag before a release triggers a reload
const MAX_PULL = 110; // px -- caps how far the indicator can be dragged down

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
 */
export function PullToRefresh() {
  const [active, setActive] = useState(false);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);

  useEffect(() => {
    if (!isNativeApp()) return;

    function onTouchStart(e: TouchEvent) {
      if (window.scrollY > 0) {
        startY.current = null;
        return;
      }
      startY.current = e.touches[0]?.clientY ?? null;
    }

    function onTouchMove(e: TouchEvent) {
      if (startY.current === null || refreshing) return;
      const delta = (e.touches[0]?.clientY ?? 0) - startY.current;
      if (delta <= 0) {
        setActive(false);
        setPull(0);
        return;
      }
      if (delta > 8) {
        setActive(true);
        setPull(Math.min(delta, MAX_PULL));
      }
    }

    function onTouchEnd() {
      if (startY.current === null) return;
      startY.current = null;
      if (pull >= PULL_THRESHOLD && !refreshing) {
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
  // Starts off-screen (-36px, above the safe-area-inset anchor below) and
  // slides down 1:1 with the drag rather than just fading in in place --
  // reads as something being physically pulled out from behind the status
  // bar, the standard pull-to-refresh feel, instead of a badge that pops
  // into existence partway down the screen.
  const progress = Math.min(pull / PULL_THRESHOLD, 1);
  const travel = refreshing ? 0 : -36 + 36 * progress;

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

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-50 flex justify-center"
      style={{ top: "calc(env(safe-area-inset-top) + 10px)" }}
    >
      <div
        className="flex h-11 w-11 items-center justify-center rounded-full bg-background/95 shadow-lg backdrop-blur"
        style={{
          transform: `translateY(${travel}px) scale(${ready ? 1 : 0.9})`,
          opacity: progress,
          transition: refreshing ? "transform 200ms ease-out" : "none",
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
