"use client";

import { useState, useTransition } from "react";
import Image from "@/components/ui/fade-image";
import Link from "next/link";
import { X } from "lucide-react";
import type { Recommendation } from "@/lib/recommendations/engine";
import { dismissRecommendation } from "@/lib/actions/dismissals";

/**
 * Horizontal-scrolling row of landscape backdrop cards -- Streaming Home
 * (Concept G) direction, replacing the earlier portrait poster-card rail.
 * Same scrollable-rail pattern as PersonIconicRoles and the Discover genre
 * filters (see globals.css's .no-scrollbar), just re-skinned: 16:9
 * backdrop_url stills instead of 2:3 poster_url art, so this row reads as
 * a Netflix/Apple TV+-style "row of shows" rather than a shelf of movie
 * posters, matching the hero above it (recommendation-reveal.tsx already
 * uses backdrop_url, not poster art). Falls back to poster_url for the
 * rare title with no backdrop rather than rendering a blank card.
 *
 * Client component (was a plain server component) so each card can carry
 * an inline "not interested" control -- see dismissRecommendation
 * (title_dismissals, migration 0066). Before this, the ONLY way to give
 * negative feedback on a shown recommendation was the full Discover swipe
 * deck; a miss on the home page had no lower-friction way to say "stop
 * showing me this" than ignoring it forever, which the engine can't
 * distinguish from "hasn't gotten around to it yet." Optimistically
 * removes the card from local state on click -- same pattern
 * SwipeRecsCard uses -- rather than waiting on a round trip or forcing a
 * revalidatePath (see dismissRecommendation's own comment for why that's
 * deliberately avoided).
 */
export function MoodRow({ picks, isColdStart }: { picks: Recommendation[]; isColdStart: boolean }) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  const visible = picks.filter(({ title }) => !dismissedIds.has(title.id));
  if (!visible.length) return null;

  function handleDismiss(titleId: string) {
    setDismissedIds((prev) => new Set(prev).add(titleId));
    startTransition(() => {
      void dismissRecommendation(titleId);
    });
  }

  return (
    <div>
      <h3 className="font-display mb-3 text-lg">{isColdStart ? "Popular right now" : "More picks for you"}</h3>
      {/* Right-edge fade -- previously the row just clipped mid-card at
          the container boundary with no visual cue there was more to
          scroll past it. A plain CSS mask on the scroll container itself
          (not a child overlay -- an overlay would sit on top of the
          cards and block taps/hover near that edge) fades the last ~10%
          of the row toward transparent, the same "there's more here"
          affordance most native horizontal-scroll UIs use. Left edge
          stays a hard cut since it's flush with the page's own left
          margin -- nothing to hint at past the start of the row. */}
      <div
        className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1"
        style={{
          maskImage: "linear-gradient(to right, black 92%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to right, black 92%, transparent 100%)",
        }}
      >
        {visible.map(({ title, reason, matchPercent }, i) => {
          const image = title.backdrop_url ?? title.poster_url;
          return (
            <div
              key={title.id}
              className="stagger-card group relative w-56 shrink-0 snap-start transition-transform duration-200 hover:-translate-y-1 sm:w-64"
              style={{ animationDelay: `${(i % 12) * 40}ms` }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDismiss(title.id);
                }}
                aria-label={`Not interested in ${title.name}`}
                // Mobile audit finding #4: opacity-0-until-hover meant this
                // control (a real, shipped feature -- inline negative
                // feedback on a recommendation) was completely invisible
                // and undiscoverable on touch, since there's no hover state
                // on a phone. md:opacity-0 confines the hover-reveal
                // behavior to devices that plausibly have a mouse; touch
                // gets a permanently-visible (if quiet) button instead.
                className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-background/70 text-foreground-muted opacity-70 backdrop-blur-sm transition-opacity duration-150 hover:bg-background/90 hover:text-foreground focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
              >
                <X size={14} />
              </button>
              <Link href={`/movie/${title.id}`} className="block">
                {/* Landscape backdrop card (Concept G / Streaming Home)
                    -- swapped from the earlier aspect-[2/3] poster
                    treatment so this row reads as a row of stills, same
                    image language as the backdrop hero above it. Corner
                    radius stays --radius-sm, matching that same
                    flattened-chrome modernization pass. */}
                {/* Radius matched to the hero card above (--radius-lg,
                    part of the same redesign pass) so the rail's cards and
                    the hero read as one governed shape language instead of
                    two different corner cuts on the same page. Border
                    stays -- unlike the hero, these are dense small tiles
                    sitting on plain background, not a full-bleed image;
                    the hairline is what separates one card from the next
                    at a glance in the scroll rail. */}
                <div className="relative aspect-video overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface transition-colors group-hover:border-border-strong">
                  {image && (
                    <Image
                      src={image}
                      alt={title.name}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                      sizes="256px"
                    />
                  )}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/70 via-transparent to-transparent" />
                  {title.genres?.[0] && (
                    <span className="absolute left-2 top-2 rounded-[var(--radius-sm)] bg-background/70 px-2 py-0.5 text-[10px] uppercase tracking-wider text-accent backdrop-blur-sm">
                      {title.genres[0]}
                    </span>
                  )}
                  {!isColdStart && matchPercent !== null && (
                    <span className="absolute bottom-2 right-2 rounded-[var(--radius-sm)] bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-foreground">
                      {matchPercent}%
                    </span>
                  )}
                </div>
                <p className="mt-2 line-clamp-1 text-sm font-medium">{title.name}</p>
                <p className="mt-1 line-clamp-2 text-xs text-foreground-muted">{reason}</p>
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
