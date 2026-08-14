"use client";

import { useState, useTransition } from "react";
import Image from "@/components/ui/fade-image";
import Link from "next/link";
import { X } from "lucide-react";
import type { Recommendation } from "@/lib/recommendations/engine";
import { dismissRecommendation } from "@/lib/actions/dismissals";

/**
 * Horizontal-scrolling poster rail (Option B / streaming-dashboard
 * direction) -- same scrollable-rail pattern as PersonIconicRoles and
 * the Discover genre filters (see globals.css's .no-scrollbar), swapped
 * in for the earlier static 2-column grid so this reads as a "row" the
 * user scrubs through rather than a stacked list.
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
      <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
        {visible.map(({ title, reason, matchPercent }, i) => (
          <div
            key={title.id}
            className="stagger-card group relative w-40 shrink-0 transition-transform duration-200 hover:-translate-y-1 sm:w-48"
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
              className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-background/70 text-foreground-muted opacity-0 backdrop-blur-sm transition-opacity duration-150 hover:bg-background/90 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
            >
              <X size={14} />
            </button>
            <Link href={`/movie/${title.id}`} className="block">
              {/* Sharpened from --radius-md (10px) to --radius-sm (6px),
                  matching the flattened hero card corner radius from the
                  same modernization pass -- see recommendation-reveal.tsx. */}
              <div className="relative aspect-[2/3] overflow-hidden rounded-[var(--radius-sm)] border border-border bg-surface transition-colors group-hover:border-border-strong">
                {title.poster_url && (
                  <Image
                    src={title.poster_url}
                    alt={title.name}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    sizes="192px"
                  />
                )}
                {title.genres?.[0] && (
                  <span className="absolute left-2 top-2 rounded-[var(--radius-sm)] bg-background/70 px-2 py-0.5 text-[10px] uppercase tracking-wider text-accent backdrop-blur-sm">
                    {title.genres[0]}
                  </span>
                )}
              </div>
              <p className="mt-2 line-clamp-1 text-sm font-medium">{title.name}</p>
              {!isColdStart && matchPercent !== null && (
                <p className="mt-0.5 text-[11px] uppercase tracking-wider text-foreground-muted">
                  {matchPercent}% match
                </p>
              )}
              <p className="mt-1 line-clamp-2 text-xs text-foreground-muted">{reason}</p>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
