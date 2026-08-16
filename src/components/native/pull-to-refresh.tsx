"use client";

import { useEffect, useRef, useState } from "react";
import { isNativeApp } from "@/lib/native/is-native";

const PULL_THRESHOLD = 72; // px of (resisted) pull before a release triggers a reload
const MAX_PULL = 110; // px -- caps how far the page can travel while actively dragging
const REFRESH_HOLD = 56; // px the page settles at once armed, so the spinner has room to read
// One full revolution of pull-refresh-rotate below (800ms), plus a small
// pad for frame-timing slop, not the ~half-a-turn 420ms this used to be.
// A hard reload freezes whatever's on screen the instant navigation
// actually starts (there's no compositor to keep animating a frozen
// document mid-reload) -- at 420ms the ring was caught mid-arc, maybe a
// third of the way around, and just stopped dead there for however long
// the reload itself took. That reads as broken/hung, not "refreshing,"
// which is exactly backwards from what a loading indicator should
// communicate. The 360deg keyframes (-90deg -> 270deg) land back on the
// exact angle they started from, so waiting for one whole turn to finish
// means the freeze lands on a *complete, settled* ring instead of an
// arbitrary mid-spin angle -- the same reason real iOS UIRefreshControls
// never get interrupted mid-rotation either.
const REFRESH_DELAY_MS = 850;

/**
 * The native iOS app has no browser chrome at all -- no address bar, no
 * pull-to-refresh affordance, nothing -- so once a screen is stuck (a
 * failed fetch, a stale session after backgrounding overnight, etc.)
 * there was previously no way to reload short of force-quitting the app
 * from the iOS app switcher. This adds the standard "pull down from the
 * top of the page" gesture, reloading the WKWebView the same way a
 * plain browser refresh would.
 *
 * Unlike a badge that just floats on top of the page, this actually
 * carries the whole page -- header bar included -- down with the drag,
 * the same way Mail/Twitter/most native apps do it: the header and
 * content are one rigid sheet that gets dragged away from the top edge,
 * and the spinner lives in the gap that opens up behind/above it, not
 * layered on top of the header. `children` here is everything meant to
 * move together (NavBar, promo banner, page content); BottomNav and the
 * spinner itself stay outside this component's translated wrapper on
 * purpose -- see layout.tsx.
 *
 * Deliberately native-app-only (isNativeApp() gate below): the ordinary
 * website already runs inside a real browser that has its own
 * pull-to-refresh (mobile Safari/Chrome) or none at all by design
 * (desktop) -- adding a second, custom one there would just fight the
 * browser's own gesture instead of filling a real gap. `pull` starts (and
 * stays, off native) at 0, so the wrapper's translateY(0) renders
 * identically whether this is native or not -- no hydration mismatch risk
 * even though isNativeApp() itself can only be trusted client-side.
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
export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const startX = useRef<number>(0);
  const axisLock = useRef<"vertical" | "horizontal" | null>(null);

  useEffect(() => {
    if (!isNativeApp()) return;

    function onTouchStart(e: TouchEvent) {
      if (refreshing) return;
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
        // Settle the page at a fixed resting depth and let the spinner
        // actually spin for a beat instead of firing reload() off the raw
        // drag position -- that read as a jump-cut, not a refresh. Real
        // pull-to-refresh always holds briefly here before the page turns
        // over, which is also what makes the gesture read as "smooth"
        // rather than instant.
        setActive(false);
        setRefreshing(true);
        setPull(REFRESH_HOLD);
        window.setTimeout(() => {
          // Plain location.reload() asks WKWebView to reload the current
          // navigation entry, and WKWebView's own on-disk cache can serve
          // that back even when the server sent Cache-Control: no-store --
          // a real, documented WKWebView quirk, not just an ordinary
          // browser cache that a normal reload always busts. Rewriting
          // the URL with a cache-busting query param forces this to be a
          // genuinely new resource as far as any cache is concerned, so a
          // deploy that's already live server-side is guaranteed to
          // actually show up here instead of silently reloading the same
          // stale response. replace() (not assigning href) so this
          // doesn't grow the back-forward history with a stack of
          // otherwise-identical refresh entries.
          const url = new URL(window.location.href);
          url.searchParams.set("_r", Date.now().toString());
          window.location.replace(url.toString());
        }, REFRESH_DELAY_MS);
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

  const progress = refreshing ? 1 : Math.min(pull / PULL_THRESHOLD, 1);
  const ready = pull >= PULL_THRESHOLD || refreshing;
  const showIndicator = active || refreshing;

  // A proper ring, not just a rotating icon: while dragging below the
  // arm threshold, the arc fills in step with the pull (0 -> 100% of the
  // ring's circumference) so the gesture itself visibly "loads" the
  // indicator -- the same language as iOS's native UIRefreshControl.
  //
  // The moment the drag crosses the arm threshold (`ready` flips true --
  // this happens at most once per gesture, whether by dragging past
  // PULL_THRESHOLD or by the release-triggered setRefreshing(true)), the
  // ring settles into a fixed partial arc and starts spinning
  // continuously via the CSS `pull-refresh-spin` class below. That class
  // is applied for the *entire* rest of the gesture -- through the armed
  // hold, into `refreshing`, all the way to reload -- rather than being
  // toggled on separately once `refreshing` becomes true. Switching
  // classes at that later point would restart the CSS animation from its
  // 0% keyframe, snapping the ring's rotation backwards at exactly the
  // moment it should read as one continuous spin -- which is what
  // actually produced the "jittery"/"stuck-then-jumps" look: a static
  // full ring sitting motionless through the held/armed moment, then a
  // sudden cut to a smaller arc at a different angle when refreshing
  // kicked in. Keying both the spin class and the arc-length switch off
  // the same `ready` boolean means there's exactly one transition per
  // gesture, and it's a single smooth handoff instead of two separate
  // jump cuts.
  const RADIUS = 15;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const dashOffset = ready ? CIRCUMFERENCE * 0.75 : CIRCUMFERENCE * (1 - progress);
  const label = refreshing ? "Refreshing…" : ready ? "Release to refresh" : "Pull to refresh";

  return (
    <>
      {/* Sits truly fixed to the viewport's top edge -- z-30, one below
          NavBar's z-40 -- so as the wrapper below drags the header down,
          this stays put and gets revealed in the growing gap above it,
          rather than floating on top of the header the way a simple
          overlay badge would. */}
      {showIndicator && (
        <div
          className="pointer-events-none fixed inset-x-0 z-30 flex flex-col items-center gap-1.5"
          style={{ top: "calc(env(safe-area-inset-top) + 8px)", opacity: progress }}
        >
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full shadow-lg backdrop-blur"
            style={{
              transform: `scale(${ready ? 1.05 : 0.88})`,
              // The badge itself shifts from a neutral dark surface to a
              // warm gold-tinted one right at the arm threshold -- the
              // same "you can let go now" cue as a real UIRefreshControl's
              // own haptic tick, just rendered visually since there's no
              // haptics API available here.
              background: ready ? "rgba(217,184,118,0.16)" : "rgba(10,9,8,0.95)",
              border: ready ? "1px solid rgba(217,184,118,0.45)" : "1px solid transparent",
              transition: "transform 200ms ease-out, background 200ms ease-out, border-color 200ms ease-out",
            }}
          >
            {/* Fixed at -90deg (not proportional to pull progress), both
                below and as the spin keyframes' own starting point --
                the arc's fill (strokeDashoffset) alone conveys pull
                progress, the same way iOS's own UIRefreshControl doesn't
                rotate while filling either. Keeping this rotation
                constant across the fill phase means there's nothing to
                interpolate when pull-refresh-spin takes over: the
                computed rotation is identical the instant before and
                the instant after, so the only thing that visibly
                changes at that handoff is the arc smoothly settling to
                its spinner length (via the transition on the circle
                below), not a rotation jump. */}
            <svg
              // Forces a brand-new DOM node the one time `ready` flips
              // true per gesture, instead of toggling the animation class
              // on an svg that's been sitting still-mounted (and already
              // painted, inside a backdrop-blur ancestor) since the drag
              // started. WebKit has real, documented cases where handing
              // an *already-composited* layer a fresh `animation` via a
              // class change doesn't reliably kick off -- it can just sit
              // on the animation's first frame indefinitely, which reads
              // as exactly "stuck at quarter circle" (the arc shrinks to
              // its armed length via the stroke-dashoffset transition,
              // which does fire, but the rotation meant to sell it as
              // *spinning* never starts). A fresh element has no prior
              // paint/composite state to inherit and always starts its
              // animation cleanly. `ready` only ever flips 0->1 once per
              // gesture (see the comment above), so this is at most one
              // extra element creation, not a remount loop.
              key={ready ? "armed" : "filling"}
              width="30"
              height="30"
              viewBox="0 0 34 34"
              className={ready ? "pull-refresh-spin" : ""}
              style={{
                transform: ready ? undefined : "rotate(-90deg)",
                // Belt-and-suspenders alongside the remount above --
                // promotes this to its own compositor layer up front so
                // the rotation is guaranteed to run on the compositor
                // thread rather than potentially getting bundled into
                // the same (WebKit-quirky) layer as the backdrop-blur
                // badge behind it.
                willChange: "transform",
              }}
            >
              {/* Faint full-circle track so the ring reads clearly even at
                  low pull distances, before much of the gold arc has
                  filled in. */}
              <circle cx="17" cy="17" r={RADIUS} fill="none" stroke="rgba(217,184,118,0.18)" strokeWidth="3" />
              {/* Only the single fill->armed handoff should ease -- while
                  actively filling (dragging, not yet armed) this needs to
                  track the finger 1:1 with zero lag, same rationale as the
                  dragged-sheet transform below. `ready` flips at most once
                  per gesture, so this transition also fires at most once. */}
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
                style={{ transition: active && !ready ? "none" : "stroke-dashoffset 260ms ease-out" }}
              />
            </svg>
          </div>
          <span
            className="rounded-[var(--radius-full)] bg-background/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground-muted shadow backdrop-blur"
            style={{ color: ready ? "var(--accent)" : undefined }}
          >
            {label}
          </span>
          <style>{`
            .pull-refresh-spin {
              animation: pull-refresh-rotate 800ms linear infinite;
            }
            @keyframes pull-refresh-rotate {
              /* Starts at the same -90deg the static (pre-spin) fill
                 phase renders, so switching this class on never has a
                 rotation value to jump from/to -- see the comment on the
                 svg's inline style above. */
              from { transform: rotate(-90deg); }
              to { transform: rotate(270deg); }
            }
          `}</style>
        </div>
      )}
      {/* The actual "physical sheet" being dragged -- header bar and page
          content translate down together as one piece. No transition
          while actively dragging (1:1 finger tracking, via
          applyResistance); a smooth ease back on release, whether that's
          snapping back to 0 (drag released early) or settling at
          REFRESH_HOLD (armed). */}
      <div
        // flex flex-1 flex-col mirrors body's own flex-col layout -- this
        // wrapper sits between body and NavBar/main now (previously they
        // were body's direct flex children), so without this main's own
        // flex-1 (fill remaining vertical space below the header) would
        // have nothing to grow within and the page would collapse to its
        // content height instead of filling the viewport.
        //
        // transform is omitted entirely at rest (pull === 0), not just
        // set to translateY(0) -- any non-"none" transform here
        // (including the identity translateY(0)) makes this div the
        // containing block for every position:fixed element rendered
        // anywhere inside it, which is the entire app. That silently
        // clipped full-viewport fixed backgrounds (Ask Slate's poster
        // wall, the cinematic intro, greeting splash, decision reveal,
        // full Wrapped story) to whatever this div's own content height
        // happened to be instead of the real screen. Only actively
        // dragging (or easing back from a drag) needs the transform, so
        // it's only present then.
        className="flex flex-1 flex-col"
        style={
          pull !== 0
            ? {
                transform: `translateY(${pull}px)`,
                transition: active ? "none" : "transform 220ms ease-out",
              }
            : undefined
        }
      >
        {children}
      </div>
    </>
  );
}

// Rubber-band resistance: the first stretch of the drag (below the
// eventual PULL_THRESHOLD) tracks the finger almost 1:1, then
// progressively resists the further past that point someone pulls --
// the standard "you can keep pulling but it gets harder" feel every
// native pull-to-refresh uses, rather than a flat linear mapping that
// either arms too easily or requires an oddly long drag with no
// in-between feedback. Caps at MAX_PULL regardless of how far the raw
// finger travel goes, so the page never gets dragged further than its
// own travel budget.
function applyResistance(rawDelta: number): number {
  if (rawDelta <= PULL_THRESHOLD) return rawDelta;
  const overshoot = rawDelta - PULL_THRESHOLD;
  const resisted = PULL_THRESHOLD + overshoot * 0.35;
  return Math.min(resisted, MAX_PULL);
}
