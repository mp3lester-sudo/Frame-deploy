"use client";

import { useState, Fragment } from "react";
import Link from "next/link";
import type { ReasonDetail } from "@/lib/recommendations/explain";

/**
 * Renders longReason as plain text, except that any substring matching a
 * cited title's own name becomes a link to that title's page — discovery-
 * depth-audit rendition #2. buildLongReason (explain.ts) interpolates each
 * cited title's name verbatim into the sentence, so a straightforward
 * substring match is enough; no fuzzy matching needed.
 *
 * Sorted longest-name-first before matching so that if one cited title's
 * name happens to be a substring of another (rare, but not impossible --
 * e.g. a sequel sharing its predecessor's title), the longer, more specific
 * match wins instead of a partial one splitting it awkwardly.
 */
export function renderLongReasonWithLinks(longReason: string, citedTitles: { id: string; name: string }[]) {
  const withNames = citedTitles.filter((c) => c.name && longReason.includes(c.name));
  if (withNames.length === 0) return longReason;

  const sorted = [...withNames].sort((a, b) => b.name.length - a.name.length);
  const escaped = sorted.map((c) => c.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "g");
  const nameToId = new Map(sorted.map((c) => [c.name, c.id]));

  const parts = longReason.split(pattern);
  return parts.map((part, i) => {
    const id = nameToId.get(part);
    if (id) {
      return (
        <Link key={i} href={`/movie/${id}`} className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">
          {part}
        </Link>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/**
 * Expandable detail behind the one-line reason — the themes, tone, pacing,
 * and ending-type data enrich-titles.ts tagged, plus (when there's a real
 * one) which of your own highly-rated titles this pick is closest to.
 * Collapsed by default so the hero stays uncluttered; the chips only render
 * once there's something real to show.
 */
/**
 * Extracted so the home hero's own expand affordance (recommendation-
 * reveal.tsx) can build the exact same chip set without duplicating this
 * logic -- both read the same ReasonDetail, both apply the same "top 3
 * themes, top 2 tones, pacing, ending" truncation.
 */
export function buildReasonChips(detail: ReasonDetail): string[] {
  return [
    ...detail.themes.slice(0, 3),
    ...detail.tone.slice(0, 2),
    detail.pacing ? `${detail.pacing} pace` : null,
    detail.endingType ? `${detail.endingType} ending` : null,
  ].filter((c): c is string => !!c);
}

export function WhyThisPick({ detail }: { detail: ReasonDetail }) {
  const [open, setOpen] = useState(false);

  const chips = buildReasonChips(detail);

  if (chips.length === 0 && !detail.longReason) return null;

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
        <div className="mt-2 max-w-xl">
          {detail.longReason && (
            <p className="text-sm leading-relaxed text-foreground-muted">
              {renderLongReasonWithLinks(detail.longReason, detail.citedTitles)}
            </p>
          )}
          {chips.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
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
      )}
    </div>
  );
}
