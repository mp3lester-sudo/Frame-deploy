"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import Image from "@/components/ui/fade-image";

// Long enough for the fan of spotlights + the poster's own entrance to
// actually land as a moment, not just flash by -- same instinct as the
// toast auto-dismiss timing (see ui/toast.tsx), just staged for the
// biggest occasion in the app.
const REVEAL_HOLD_MS = 4400;

// Angles for the spotlight fan converging on the poster from above --
// odd count so one beam lands dead center, mirrored pairs fan outward.
const BEAM_ANGLES = [-34, -20, -8, 0, 8, 20, 34];

/**
 * Shown to everyone still on a Movie Night session's screen the instant
 * the group's pick locks in (see the movie_nights realtime handler in
 * live-candidate-voting.tsx) -- the payoff for the whole session, not a
 * quiet swap to a small card. A fan of gold spotlight beams sweeps in and
 * converges on the poster, which is the only thing actually lit; everything
 * else -- the "it's decided" label, the title, the auto-advance line --
 * stays small and stays out of its way.
 *
 * Auto-advances to the movie's own page (trailer + Where to Watch already
 * live there) after REVEAL_HOLD_MS; tapping/pressing anywhere skips ahead
 * immediately for anyone who doesn't want to wait.
 */
export function DecisionReveal({
  titleId,
  name,
  posterUrl,
}: {
  titleId: string;
  name: string;
  posterUrl: string | null;
}) {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(go, REVEAL_HOLD_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- go() only closes over titleId/router, both stable for this instance
  }, []);

  function go() {
    router.replace(`/movie/${titleId}`);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={go}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") go();
      }}
      className="fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-5 overflow-hidden bg-background px-6 text-center"
    >
      {/* Ambient glow behind everything -- same radial the home page
          greeting and page backgrounds use, just staged as an entrance. */}
      <div
        aria-hidden="true"
        className="reveal-glow pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 70% 60% at 50% 38%, rgba(217,184,118,0.28) 0%, transparent 72%)",
        }}
      />

      {/* The fan itself -- a handful of gold beams pinned above the
          poster, each rotated to a fixed angle and growing in from
          nothing (scaleY 0 -> 1, origin top), staggered so they sweep in
          left-to-right-ish rather than all snapping on at once. Purely
          decorative light, not meant to be legible, so it's aria-hidden. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 flex h-[70vh] justify-center">
        {BEAM_ANGLES.map((deg) => (
          <div
            key={deg}
            className="spotlight-beam absolute top-0 h-full w-[9%] origin-top"
            style={
              {
                "--beam-rotate": `${deg}deg`,
                background: "linear-gradient(to bottom, rgba(217,184,118,0.32), transparent 65%)",
                animationDelay: `${Math.abs(deg) * 6}ms`,
              } as CSSProperties
            }
          />
        ))}
      </div>

      <p className="marquee-bulbs reveal-fade-up font-hollywood relative text-xs uppercase tracking-[0.35em] [animation-delay:1500ms]">
        It&apos;s decided
      </p>

      {/* The poster is the moment -- everything above and below it is
          deliberately small and quiet by comparison. */}
      <div
        className="poster-fan-in relative aspect-[2/3] h-[54vh] max-h-[560px] w-auto overflow-hidden rounded-[var(--radius-lg)] border border-accent/50 bg-surface-raised shadow-[0_0_140px_-15px_rgba(217,184,118,0.8)] [animation-delay:250ms]"
      >
        {posterUrl && (
          <Image src={posterUrl} alt={name} fill priority className="object-cover" sizes="(max-width: 640px) 80vw, 400px" />
        )}
      </div>

      <h1 className="reveal-fade-up font-display relative text-2xl sm:text-3xl [animation-delay:1700ms]">{name}</h1>
      <p className="reveal-fade-up relative text-xs text-foreground-muted [animation-delay:1900ms]">
        Taking you there now&hellip;
      </p>
    </div>
  );
}
