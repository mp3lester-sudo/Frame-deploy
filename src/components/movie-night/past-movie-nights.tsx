"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const STATUS_LABEL: Record<string, string> = {
  collecting: "Collecting picks",
  decided: "Decided",
  cancelled: "Cancelled",
};

// How many past (decided/cancelled) nights show before the list gets
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
};

export function PastMovieNights({ nights }: { nights: PastNightRow[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!nights.length) return null;

  const visible = expanded ? nights : nights.slice(0, INITIAL_VISIBLE);
  const remaining = nights.length - visible.length;

  return (
    <div className="mt-8 border-t border-border pt-6">
      <p className="mb-3 text-[10px] uppercase tracking-wider text-foreground-muted">
        Past nights &middot; {nights.length}
      </p>
      <div className="flex flex-col gap-3">
        {visible.map((night) => (
          <Link
            key={night.id}
            href={`/movie-night/${night.id}`}
            className="flex items-center justify-between rounded-[var(--radius-md)] border border-border bg-surface p-4 opacity-80 transition-opacity hover:border-border-strong hover:opacity-100"
          >
            <div>
              <p className="text-sm font-medium">{night.hostLabel}</p>
              <p className="mt-1 text-[11px] uppercase tracking-wider text-foreground-muted">
                {night.countLabel} &middot; {night.decidedTitleName ?? STATUS_LABEL[night.status]}
              </p>
            </div>
            <span className="text-xs uppercase tracking-wider text-foreground-muted">
              {STATUS_LABEL[night.status]}
            </span>
          </Link>
        ))}
      </div>
      {remaining > 0 && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" size="sm" onClick={() => setExpanded(true)}>
            Show {remaining} more
          </Button>
        </div>
      )}
    </div>
  );
}
