"use client";

import { useRef, type PointerEvent, type ReactNode } from "react";

/**
 * Cursor-reactive 3D tilt + a moving glare highlight, for the favorites
 * podium specifically -- the page's one showcase moment, so it gets a
 * more tactile hover than the flat lift/shine used elsewhere. Wraps a
 * whole podium tile (poster, caption, and badge move together as one
 * physical object) while the glare itself is sized to just the poster's
 * own aspect-[2/3] box so the highlight doesn't wash out the caption
 * text underneath.
 *
 * No-ops for touch input (there's no "hovering a cursor" premise on a
 * touchscreen) and for prefers-reduced-motion, both via a plain
 * matchMedia/pointerType check rather than a CSS override, since the
 * whole effect is JS-driven pointer tracking rather than a CSS
 * animation class.
 */
export function TiltCard({ children, className }: { children: ReactNode; className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse") return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = rootRef.current;
    if (!root) return;
    cancelAnimationFrame(rafRef.current);
    const { clientX, clientY } = e;
    rafRef.current = requestAnimationFrame(() => {
      const rect = root.getBoundingClientRect();
      const px = (clientX - rect.left) / rect.width;
      const py = (clientY - rect.top) / rect.height;
      const rotateY = (px - 0.5) * 16;
      const rotateX = (0.5 - py) * 16;
      root.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.045, 1.045, 1.045)`;
      if (glareRef.current) {
        glareRef.current.style.background = `radial-gradient(circle at ${px * 100}% ${py * 100}%, rgba(255,255,255,0.28), transparent 58%)`;
        glareRef.current.style.opacity = "1";
      }
    });
  }

  function handlePointerLeave() {
    cancelAnimationFrame(rafRef.current);
    const root = rootRef.current;
    if (root) root.style.transform = "";
    if (glareRef.current) glareRef.current.style.opacity = "0";
  }

  return (
    <div
      ref={rootRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={className}
      style={{ transition: "transform 320ms cubic-bezier(0.16,1,0.3,1)", transformStyle: "preserve-3d", willChange: "transform" }}
    >
      <div
        ref={glareRef}
        className="pointer-events-none absolute inset-x-0 top-0 z-20 aspect-[2/3] w-full overflow-hidden rounded-[var(--radius-md)] opacity-0 transition-opacity duration-200"
      />
      {children}
    </div>
  );
}
