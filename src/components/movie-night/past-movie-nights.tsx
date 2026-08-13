"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "@/components/ui/fade-image";
import { createMovieNight } from "@/lib/actions/movie-night";

const STATUS_LABEL: Record<string, string> = {
  collecting: "Collecting picks",
  decided: "Decided",
  cancelled: "Cancelled",
};

// How many past (decided/cancelled) nights show before the grid gets
// crowded -- everything past this count collapses behind "Show more"
// instead of stretching the page indefinitely. Purely client-side (no
// extra DB round-trip) since the parent server component already
// fetched every night the user's ever been part of in one query.
const INITIAL_VISIBLE = 5;

export type PastNightRow = {
  id: string;
  status: string;
  hostLabel: string;
  countLabel: string;
  decidedTitleName: string | null;
  posterUrl: string | null;
  dateLabel: string;
};

/**
 * Poster-grid replacement for the old flat bordered-row list. Each past
 * night is a small bento tile with its decided pick's poster as the
 * background (a plain surface tile for cancelled nights, which have no
 * poster) -- browsing your movie night history now looks like flipping
 * through a stack of posters instead of reading a table. "Start a movie
 * night" folds into this same grid as a dashed ghost tile rather than
 * living in the page header, since it's really just another tile in the
 * same collection, not a separate global action.
 */
export function PastMovieNights({ nights }: { nights: PastNightRow[] }) {
  const [expanded, setExpanded] = useState(false);

  const visible = expanded ? nights : nights.slice(0, INITIAL_VISIBLE);
  const remaining = nights.length - visible.length;

  return (
    <div className={nights.length ? "mt-8" : ""}>
      {nights.length > 0 && (
        <p className="mb-3 text-[10px] uppercase tracking-wider text-foreground-muted">
          Past nights &middot; {nights.length}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {visible.map((night) => (
          <Link
            key={night.id}
            href={`/movie-night/${night.id}`}
            className="bento-card group relative flex aspect-[4/5] flex-col justify-end overflow-hidden p-3"
          >
            {night.posterUrl && (
              <Image
                src={night.posterUrl}
                alt={night.decidedTitleName ?? "Movie night"}
                fill
                className="object-cover opacity-70 transition-opacity group-hover:opacity-90"
                sizes="200px"
              />
            )}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  "linear-gradient(0deg, rgba(10,9,8,0.92) 10%, rgba(10,9,8,0.15) 60%, rgba(10,9,8,0.05) 100%)",
              }}
            />
            <div className="relative">
              <p className="truncate text-sm font-medium text-foreground">
                {night.decidedTitleName ?? STATUS_LABEL[night.status]}
              </p>
              <p className="mt-0.5 truncate text-[10px] uppercase tracking-wider text-foreground-muted">
                {night.countLabel} &middot; {night.dateLabel}
              </p>
            </div>
          </Link>
        ))}

        <form action={createMovieNight} className="contents">
          <button
            type="submit"
            className="bento-card flex aspect-[4/5] flex-col items-center justify-center gap-1.5 border-dashed text-accent transition-colors hover:border-accent/50"
            style={{ borderStyle: "dashed" }}
          >
            <span className="text-2xl leading-none">+</span>
            <span className="px-2 text-center text-[11px] font-medium leading-tight">Start a movie night</span>
          </button>
        </form>
      </div>

      {remaining > 0 && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-xs uppercase tracking-wider text-foreground-muted hover:text-foreground"
          >
            Show {remaining} more
          </button>
        </div>
      )}
    </div>
  );
}
