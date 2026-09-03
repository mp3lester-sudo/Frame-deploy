"use client";

import { useState } from "react";

/**
 * Bio block for the person page, extracted out of PersonHero now that the
 * hero is a full-bleed image with no room beside it to clamp against (see
 * person-hero.tsx). A plain line-clamp + toggle replaces the old
 * ResizeObserver-measured "clamp to portrait height" logic -- that only
 * existed because the bio used to sit next to a specific-height portrait
 * rectangle; with nothing to measure against anymore, a fixed 4-line
 * clamp is simpler and reads the same to a visitor.
 */
export function PersonBio({ bio, bioLoading = false }: { bio: string | null; bioLoading?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  if (bioLoading) {
    return (
      <div className="animate-pulse space-y-2">
        <div className="h-3 w-full rounded bg-surface-raised" />
        <div className="h-3 w-11/12 rounded bg-surface-raised" />
        <div className="h-3 w-2/3 rounded bg-surface-raised" />
      </div>
    );
  }

  if (!bio) {
    return <p className="text-sm text-foreground-muted">No biography available yet.</p>;
  }

  return (
    <div>
      <p className={`whitespace-pre-line text-sm leading-relaxed text-foreground-muted ${expanded ? "" : "line-clamp-4"}`}>
        {bio}
      </p>
      {bio.length > 240 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-2 text-xs font-medium text-accent hover:brightness-110"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
