"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Fades + lifts its children in once they scroll into view, for
 * below-the-fold sections (Recently watched, taste compatibility) that
 * would otherwise just pop into place. Uses inline style + transition
 * rather than a CSS keyframe class so it can check prefers-reduced-motion
 * once in JS and skip straight to fully visible, no transition at all,
 * rather than needing a parallel reduced-motion override elsewhere.
 */
export function Reveal({
  children,
  className,
  delayMs = 0,
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [motionOk, setMotionOk] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      // Same SSR-safety rationale as animated-counter.tsx -- this has to
      // run in an effect (matchMedia doesn't exist during SSR), so it
      // can't be moved to a lazy useState initializer without risking a
      // hydration mismatch for reduced-motion users.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(true);
      return;
    }
    setMotionOk(true);
    const el = ref.current;
    if (!el) return;

    // Defensive fallback (task #842): live testing found this section
    // can render permanently at opacity:0 -- the content mounts and is
    // scrolled well past, but no IntersectionObserver crossing event
    // ever lands, so setVisible(true) never fires. Rather than chase the
    // exact browser/timing trigger, just check the element's own
    // position the moment the effect runs: if it's already at least
    // partially on screen (e.g. a fast scroll landed past it before the
    // observer was attached), reveal it immediately instead of waiting
    // on a crossing event that may never come.
    const rect = el.getBoundingClientRect();
    const alreadyInView = rect.top < window.innerHeight && rect.bottom > 0;
    if (alreadyInView) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : "translateY(18px)",
        transition: motionOk
          ? `opacity 700ms ease ${delayMs}ms, transform 700ms cubic-bezier(0.16,1,0.3,1) ${delayMs}ms`
          : undefined,
      }}
    >
      {children}
    </div>
  );
}
