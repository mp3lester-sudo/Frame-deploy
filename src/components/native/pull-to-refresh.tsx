"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCw } from "lucide-react";
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

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-50 flex justify-center"
      style={{ top: "calc(env(safe-area-inset-top) + 8px)" }}
    >
      <div
        className="flex h-9 w-9 items-center justify-center rounded-full bg-background/90 text-gold-foil shadow-lg backdrop-blur transition-transform"
        style={{
          transform: `translateY(${Math.min(pull, MAX_PULL) * 0.6}px) scale(${ready ? 1 : 0.85})`,
          opacity: Math.min(pull / PULL_THRESHOLD, 1),
        }}
      >
        <RotateCw size={16} className={refreshing ? "animate-spin" : ""} />
      </div>
    </div>
  );
}
