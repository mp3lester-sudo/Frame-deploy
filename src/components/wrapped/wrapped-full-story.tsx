"use client";

import { useState } from "react";
import Image from "@/components/ui/fade-image";
import { WrappedStory } from "@/components/wrapped/wrapped-story";
import type { WrappedResult } from "@/lib/taste-dna/wrapped";

/**
 * Client wrapper around the primary yearly WrappedStory that makes it a
 * real full-screen takeover (like Instagram/Spotify Wrapped) instead of
 * a card embedded in the page. Opens automatically on mount -- landing
 * on /wrapped should immediately show "your Wrapped", not a small boxed
 * preview -- and covers the whole viewport including the site nav (see
 * variant="full" in wrapped-story.tsx). Closing (the X inside the
 * story) collapses back to a poster-backed preview tile in the normal
 * page flow, so the weekly/monthly recap and year switcher above it on
 * /wrapped/page.tsx stay reachable without losing the story entirely --
 * tapping the tile reopens it full-screen again.
 */
export function WrappedFullStory({
  result,
  headline,
  shareYear,
}: {
  result: WrappedResult;
  headline: string;
  shareYear: number;
}) {
  const [open, setOpen] = useState(true);

  if (!open) {
    return <CollapsedPreview result={result} headline={headline} onOpen={() => setOpen(true)} />;
  }

  return (
    <WrappedStory
      result={result}
      headline={headline}
      shareYear={shareYear}
      variant="full"
      onClose={() => setOpen(false)}
    />
  );
}

function CollapsedPreview({
  result,
  headline,
  onOpen,
}: {
  result: WrappedResult;
  headline: string;
  onOpen: () => void;
}) {
  const poster = result.backdropPosterUrls[0] ?? null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative block h-72 w-full overflow-hidden rounded-[var(--radius-lg)] bg-surface-raised text-left sm:h-80"
    >
      {poster ? (
        <Image
          src={poster}
          alt=""
          fill
          className="scale-110 object-cover opacity-40 blur-sm transition duration-300 group-hover:scale-125"
        />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(217,184,118,0.14),transparent_60%)]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-[rgba(18,7,8,0.45)] via-[rgba(18,7,8,0.55)] to-[rgba(18,7,8,0.92)]" />
      <div className="relative flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">Marquee Wrapped</p>
        <h2 className="font-hollywood text-4xl uppercase tracking-[0.03em] sm:text-5xl">{headline}</h2>
        <span className="mt-1 inline-flex items-center gap-2 rounded-[var(--radius-full)] border border-white/20 bg-white/10 px-4 py-2 text-xs font-medium uppercase tracking-wider backdrop-blur-md transition group-hover:bg-white/20">
          Watch your Wrapped
        </span>
      </div>
    </button>
  );
}
