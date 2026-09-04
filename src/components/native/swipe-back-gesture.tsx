"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isNativeApp } from "@/lib/native/is-native";

const EDGE_ZONE = 24; // px from the left edge a touch must start within to arm -- see doc comment
const AXIS_LOCK_DISTANCE = 8; // px of initial movement before committing to horizontal vs vertical
const COMMIT_FRACTION = 0.35; // fraction of viewport width dragged before release auto-commits
const FLING_VELOCITY = 0.5; // px/ms -- a fast flick commits even short of COMMIT_FRACTION
const SETTLE_MS = 160; // how long the commit/snap-back animation takes

/**
 * The native iOS app has no browser chrome at all (see BackButton's own
 * doc comment) -- no address bar, no back button, and critically none of
 * WKWebView's real edge-swipe-to-go-back gesture either, unlike Safari or
 * any native UINavigationController screen. BackButton covers the
 * "there's a visible tap target" half of that gap; this covers the other
 * half users actually reach for first on iOS -- dragging in from the
 * left edge, the same gesture Instagram/most native apps use to pop back
 * a level.
 *
 * Deliberately native-app-only (isNativeApp() gate, same as
 * PullToRefresh): the real website already runs inside a real browser
 * that either has its own edge-swipe-back (mobile Safari/Chrome) or
 * doesn't need one (desktop, where "swipe" isn't a pointer gesture at
 * all) -- adding a custom one there would just fight the browser's own
 * gesture or add an unwanted affordance nobody asked for.
 *
 * Only arms for a touch that STARTS within EDGE_ZONE px of the left
 * edge, mirroring iOS's own interactive-pop-gesture recognizer (which
 * requires the same). This is what keeps this from hijacking every other
 * horizontal drag in the app -- Discover's SwipeRecsCard, the onboarding
 * swipe deck, the momentum-meter drag -- all of which start from
 * wherever the card/element itself is, not specifically the screen's
 * left sliver. Combined with the axis-lock below (first ~8px of movement
 * decides horizontal vs vertical, same disambiguation PullToRefresh
 * uses against this component), a scroll or an in-content gesture that
 * happens to start near the edge still won't accidentally arm this.
 *
 * Doesn't arm at all when window.history.length <= 1 -- there's nothing
 * to swipe back TO. A page-specific BackButton can fall back to a
 * sensible route (e.g. /discover) because it knows its own context; a
 * single global gesture mounted in the root layout has no such
 * per-page knowledge, so the safer choice is to simply not offer the
 * gesture rather than guess a fallback destination that might feel
 * random on an arbitrary page.
 *
 * Visual: the current page slides right with the finger (1:1, not
 * resisted like PullToRefresh's rubber-band -- this is real navigation
 * tracking, not a capped decorative pull) and a thin gold edge-light
 * fades in to sell the direction. There's no second "previous page
 * peeking in from behind" layer the way a true UINavigationController
 * transition has -- building that would mean keeping the prior route's
 * rendered output alive underneath, which Next's App Router doesn't
 * give an easy hook for. The lean-and-release motion alone is enough to
 * read as "swipe to go back" without it.
 */
export function SwipeBackGesture({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [dragX, setDragX] = useState(0);
  const [settling, setSettling] = useState(false);
  const startX = useRef<number | null>(null);
  const startY = useRef(0);
  const axisLock = useRef<"horizontal" | "vertical" | null>(null);
  const dragXRef = useRef(0);
  const lastMoveRef = useRef<{ x: number; t: number } | null>(null);
  const velocityRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  function scheduleRender() {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setDragX(dragXRef.current);
    });
  }

  useEffect(() => {
    if (!isNativeApp()) return;

    function onTouchStart(e: TouchEvent) {
      const touch = e.touches[0];
      if (!touch || touch.clientX > EDGE_ZONE || window.history.length <= 1) {
        startX.current = null;
        return;
      }
      startX.current = touch.clientX;
      startY.current = touch.clientY;
      axisLock.current = null;
      lastMoveRef.current = { x: touch.clientX, t: e.timeStamp };
      velocityRef.current = 0;
    }

    function onTouchMove(e: TouchEvent) {
      if (startX.current === null) return;
      const touch = e.touches[0];
      if (!touch) return;
      const deltaX = touch.clientX - startX.current;
      const deltaY = touch.clientY - startY.current;

      if (axisLock.current === null && (Math.abs(deltaX) > AXIS_LOCK_DISTANCE || Math.abs(deltaY) > AXIS_LOCK_DISTANCE)) {
        axisLock.current = Math.abs(deltaX) > Math.abs(deltaY) ? "horizontal" : "vertical";
      }
      if (axisLock.current !== "horizontal") return;

      const last = lastMoveRef.current;
      if (last) {
        const dt = e.timeStamp - last.t;
        if (dt > 0) velocityRef.current = (touch.clientX - last.x) / dt;
      }
      lastMoveRef.current = { x: touch.clientX, t: e.timeStamp };

      dragXRef.current = Math.max(0, Math.min(deltaX, window.innerWidth * 0.92));
      scheduleRender();
    }

    function onTouchEnd() {
      if (startX.current === null) return;
      startX.current = null;
      if (axisLock.current !== "horizontal") {
        dragXRef.current = 0;
        setDragX(0);
        return;
      }

      const width = window.innerWidth;
      const shouldCommit = dragXRef.current >= width * COMMIT_FRACTION || velocityRef.current >= FLING_VELOCITY;

      if (shouldCommit) {
        setSettling(true);
        dragXRef.current = width;
        setDragX(width);
        // Lets the slide-to-edge animation actually play before handing
        // off to router.back() -- same "settle, then act" shape as
        // PullToRefresh's own armed-hold-then-reload. Reset happens in
        // the same callback as the navigation call (not a separate,
        // later effect) so the wrapper is back at rest before the next
        // route's content ever paints through it -- this component lives
        // in the root layout and persists across client-side
        // navigations, so a stale non-zero dragX left behind would show
        // up as the brand-new page rendering already shifted off-screen.
        window.setTimeout(() => {
          setSettling(false);
          dragXRef.current = 0;
          setDragX(0);
          router.back();
        }, SETTLE_MS);
      } else {
        setSettling(true);
        dragXRef.current = 0;
        setDragX(0);
        window.setTimeout(() => setSettling(false), SETTLE_MS);
      }
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [router]);

  const edgeGlowOpacity = typeof window !== "undefined" ? Math.min(dragX / 120, 1) : 0;

  return (
    <div className="flex flex-1 flex-col">
      {/* See the containing-block footgun documented at length in
          PullToRefresh's own render -- transform is omitted entirely at
          rest (dragX === 0) for the exact same reason: a non-"none"
          transform here would make this div the containing block for
          every position:fixed element rendered anywhere inside it
          (modals, the cinematic intro, decision reveal, Wrapped, the Ask
          Slate poster wall), silently reflowing all of them relative to
          this wrapper instead of the real viewport. Only present for the
          brief window an edge-swipe is actually active or settling. */}
      <div
        className="flex flex-1 flex-col"
        style={
          dragX !== 0
            ? {
                transform: `translateX(${dragX}px)`,
                transition: settling ? `transform ${SETTLE_MS}ms ease-out` : "none",
              }
            : undefined
        }
      >
        {children}
      </div>
      {dragX > 0 && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-y-0 left-0 z-50"
          style={{
            width: 3,
            background: "var(--accent)",
            boxShadow: "0 0 16px 2px rgba(217,184,118,0.6)",
            opacity: edgeGlowOpacity,
          }}
        />
      )}
    </div>
  );
}
