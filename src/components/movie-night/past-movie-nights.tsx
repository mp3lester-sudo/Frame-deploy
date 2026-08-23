"use client";

import { useState } from "react";
import Link from "next/link";
import { Ban, Clapperboard } from "lucide-react";
import Image from "@/components/ui/fade-image";

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
 * background -- browsing your movie night history now looks like
 * flipping through a stack of posters instead of reading a table.
 * "Start a movie night" lives in the page header (above the fold)
 * rather than in this grid -- it needs to be visible without scrolling,
 * not discovered at the bottom of a list that can run to dozens of
 * past nights.
 *
 * Cancelled nights (and, rarely, a decided night whose title is
 * missing a poster) have no image to show. Earlier this fell through
 * to a plain bento-card with the poster-legibility gradient still
 * painted over nothing -- it read as a broken/missing image sitting
 * next to real poster art. Now those tiles get a deliberate muted
 * icon treatment instead, so an empty slot reads as "nothing was
 * decided here," not "this poster failed to load."
 */
export function PastMovieNights({ nights }: { nights: PastNightRow[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!nights.length) return null;

  const visible = expanded ? nights : nights.slice(0, INITIAL_VISIBLE);
  const remaining = nights.length - visible.length;

  return (
    <div className="mt-8">
      <p className="mb-3 text-[10px] uppercase tracking-wider text-foreground-muted">
        Past nights &middot; {nights.length}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {visible.map((night) => {
          const hasPoster = !!night.posterUrl;
          const Icon = night.status === "cancelled" ? Ban : Clapperboard;
          return (
            <Link
              key={night.id}
              href={`/movie-night/${night.id}`}
              className="bento-card group relative flex aspect-[4/5] flex-col justify-end overflow-hidden p-3"
            >
              {hasPoster ? (
                <>
                  <Image
                    src={night.posterUrl as string}
                    alt={night.decidedTitleName ?? "Movie night"}
                    fill
                    className="object-cover opacity-70 transition-opacity group-hover:opacity-90"
                    sizes="200px"
                  />
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      backgroundImage:
                        "linear-gradient(0deg, rgba(10,9,8,0.92) 10%, rgba(10,9,8,0.15) 60%, rgba(10,9,8,0.05) 100%)",
                    }}
                  />
                </>
              ) : (
                <Icon
                  aria-hidden
                  className="pointer-events-none absolute left-1/2 top-[38%] h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-foreground-muted opacity-25"
                />
              )}
              <div className="relative">
                <p className="truncate text-sm font-medium text-foreground">
                  {night.decidedTitleName ?? STATUS_LABEL[night.status]}
                </p>
                <p className="mt-0.5 truncate text-[10px] uppercase tracking-wider text-foreground-muted">
                  {night.countLabel} &middot; {night.dateLabel}
                </p>
              </div>
            </Link>
          );
        })}
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
