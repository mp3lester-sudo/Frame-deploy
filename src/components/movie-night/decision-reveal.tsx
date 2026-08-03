"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "@/components/ui/fade-image";

// Long enough to actually read as a moment, short enough that nobody's
// stuck waiting on a screen with nothing left to do -- same instinct as
// the toast auto-dismiss timing (see ui/toast.tsx), just staged for a
// bigger occasion.
const REVEAL_HOLD_MS = 3200;

/**
 * Shown to everyone still on a Movie Night session's screen the instant
 * it's decided (see the movie_nights realtime handler in
 * live-candidate-voting.tsx) -- a themed "it's decided" moment before
 * handing off to the title's own page, rather than the group's pick just
 * silently swapping in as a small card. Reuses the same golden
 * .marquee-bulbs treatment as the home page greeting and the page
 * background's radial spotlight glow, staged as an entrance instead of a
 * static backdrop.
 *
 * Auto-advances to the movie page after REVEAL_HOLD_MS; tapping/pressing
 * anywhere skips ahead immediately for anyone who doesn't want to wait.
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
      className="fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-6 overflow-hidden bg-background px-6 text-center"
    >
      <div
        aria-hidden="true"
        className="reveal-glow pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 560px 460px at 50% 42%, rgba(217,184,118,0.35) 0%, transparent 70%)",
        }}
      />

      <p className="marquee-bulbs reveal-fade-up font-hollywood relative text-sm uppercase tracking-[0.3em]">
        It&apos;s decided
      </p>

      <div
        className="reveal-pop relative h-64 w-44 overflow-hidden rounded-[var(--radius-lg)] border border-accent/40 bg-surface-raised shadow-[0_0_70px_-12px_rgba(217,184,118,0.65)] [animation-delay:150ms]"
      >
        {posterUrl && <Image src={posterUrl} alt={name} fill priority className="object-cover" sizes="176px" />}
      </div>

      <h1 className="reveal-fade-up font-display relative text-3xl [animation-delay:350ms]">{name}</h1>
      <p className="reveal-fade-up relative text-xs text-foreground-muted [animation-delay:550ms]">
        Taking you there now&hellip;
      </p>
    </div>
  );
}
