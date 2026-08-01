"use client";

import { useEffect, useState } from "react";

/**
 * The page itself stays a Server Component (it needs the live DB query for
 * dna), so the fill-on-mount animation lives in this small client piece —
 * server-rendering the bar already at its final width would skip the
 * animation entirely, since there'd be no "0 to value" transition to play.
 * Starts at 0 and animates to the real percent right after mount, with a
 * small stagger per row (via delayMs) so a full list of archetypes fills in
 * one after another rather than all at once.
 *
 * Also doubles as the row renderer for the era-distribution chart (see
 * profile page) — `name` there is a decade string ("1990s") instead of an
 * archetype name. citedTitles/matchedKeywords are archetype-only evidence;
 * era rows simply omit them.
 */
export function ArchetypeBar({
  name,
  percent,
  delayMs = 0,
  citedTitles,
  matchedKeywords,
}: {
  name: string;
  percent: number;
  delayMs?: number;
  /** Up to 3 rated titles that most drove this score -- the receipts
   *  behind the number, shown as a small line under the bar. */
  citedTitles?: { id: string; name: string }[];
  /** Up to 3 tone/theme/mood keywords that actually matched. */
  matchedKeywords?: string[];
}) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    // Committing the 0-width render, then flipping to the real value on the
    // next tick, is what makes the CSS transition below actually play —
    // setting it synchronously on mount would just paint at full width with
    // no visible fill.
    const timer = setTimeout(() => setWidth(percent), delayMs + 50);
    return () => clearTimeout(timer);
  }, [percent, delayMs]);

  const hasEvidence = (citedTitles?.length ?? 0) > 0 || (matchedKeywords?.length ?? 0) > 0;

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="font-display text-sm">{name}</span>
        <span className="text-sm font-medium text-accent">{percent}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
          style={{ width: `${width}%` }}
        />
      </div>
      {hasEvidence && (
        <p className="mt-1 line-clamp-1 text-xs text-foreground-muted">
          {citedTitles && citedTitles.length > 0 && citedTitles.map((t) => t.name).join(", ")}
          {citedTitles && citedTitles.length > 0 && matchedKeywords && matchedKeywords.length > 0 && " — "}
          {matchedKeywords && matchedKeywords.length > 0 && matchedKeywords.join(", ")}
        </p>
      )}
    </div>
  );
}
