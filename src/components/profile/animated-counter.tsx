"use client";

import { useEffect, useState } from "react";

/**
 * Counts up from 0 to `value` once mounted (ease-out cubic) instead of
 * just printing the number — used for the profile page's ticket-stub
 * stat strip so watched/follower counts feel "totaled up" rather than
 * appearing flat. Skips straight to the final value for anyone who's
 * asked for less motion.
 */
export function AnimatedCounter({ value, durationMs = 900 }: { value: number; durationMs?: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(eased * value));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return <>{display}</>;
}
