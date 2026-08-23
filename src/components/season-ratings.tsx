"use client";

import { useState, useTransition } from "react";
import { RatingStars } from "@/components/ui/rating-stars";
import { setSeasonRating, deleteSeasonRating } from "@/lib/actions/season-ratings";

/**
 * Optional per-season rating list -- shown underneath the whole-show
 * RateControl on a TV title's detail page (see movie/[id]/page.tsx),
 * never in place of it. Mirrors RateControl's own optimistic-update /
 * revert-on-failure pattern (src/components/rate-control.tsx) at a
 * smaller size, one row per season.
 */
export function SeasonRatings({
  titleId,
  numberOfSeasons,
  initialRatings,
}: {
  titleId: string;
  numberOfSeasons: number;
  initialRatings: Record<number, number>;
}) {
  const [ratings, setRatings] = useState(initialRatings);
  const [isPending, startTransition] = useTransition();

  function handleChange(seasonNumber: number, next: number) {
    const previous = ratings[seasonNumber] ?? 0;
    setRatings((r) => ({ ...r, [seasonNumber]: next }));
    startTransition(async () => {
      try {
        await setSeasonRating({ titleId, seasonNumber, score: next });
      } catch {
        setRatings((r) => ({ ...r, [seasonNumber]: previous }));
      }
    });
  }

  function handleRemove(seasonNumber: number) {
    const previous = ratings[seasonNumber] ?? 0;
    setRatings((r) => {
      const next = { ...r };
      delete next[seasonNumber];
      return next;
    });
    startTransition(async () => {
      try {
        await deleteSeasonRating({ titleId, seasonNumber });
      } catch {
        setRatings((r) => ({ ...r, [seasonNumber]: previous }));
      }
    });
  }

  if (numberOfSeasons < 1) return null;

  return (
    <div className="mt-3">
      <p className="mb-2 text-[10px] uppercase tracking-wider text-foreground-muted">Rate by season</p>
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: numberOfSeasons }, (_, i) => i + 1).map((seasonNumber) => {
          const score = ratings[seasonNumber] ?? 0;
          return (
            <div key={seasonNumber} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-xs text-foreground-muted">Season {seasonNumber}</span>
              <RatingStars value={score} onChange={(next) => handleChange(seasonNumber, next)} size={20} />
              {!isPending && score > 0 && (
                <button
                  type="button"
                  onClick={() => handleRemove(seasonNumber)}
                  className="text-[10px] text-foreground-muted hover:text-danger"
                >
                  Remove
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
