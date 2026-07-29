"use client";

import { useState } from "react";
import type { ReasonDetail } from "@/lib/recommendations/explain";

/**
 * Expandable detail behind the one-line reason — the themes, tone, pacing,
 * and ending-type data enrich-titles.ts tagged, plus (when there's a real
 * one) which of your own highly-rated titles this pick is closest to.
 * Collapsed by default so the hero stays uncluttered; the chips only render
 * once there's something real to show.
 */
export function WhyThisPick({ detail }: { detail: ReasonDetail }) {
  const [open, setOpen] = useState(false);

  const chips = [
    ...detail.themes.slice(0, 3),
    ...detail.tone.slice(0, 2),
    detail.pacing ? `${detail.pacing} pace` : null,
    detail.endingType ? `${detail.endingType} ending` : null,
  ].filter((c): c is string => !!c);

  if (chips.length === 0) return null;

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-[11px] font-medium uppercase tracking-wider text-foreground-muted hover:text-accent"
        aria-expanded={open}
      >
        {open ? "Hide details" : "Why this pick"} {open ? "‹" : "›"}
      </button>
      {open && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <span
              key={chip}
              className="rounded-[var(--radius-full)] border border-border px-2.5 py-1 text-[11px] text-foreground-muted"
            >
              {chip}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
