"use client";

import { useState } from "react";
import { PersonPortrait } from "@/components/person-portrait";
import { cn } from "@/lib/utils";

/** Below this length, a bio just renders as a normal paragraph — no toggle
 *  UI at all for the common case of a short, already-tidy bio. Above it,
 *  clamp to a few lines and offer a "Show more" toggle rather than dumping
 *  a wall of text (some TMDB bios run to multiple paragraphs). */
const LONG_TEXT_THRESHOLD = 380;
const CLAMPED_LINES = 5;

/**
 * Portrait + name/meta/bio header for a person profile page, as one client
 * component. The "Show more" toggle sits directly under the portrait (not
 * at the bottom of the bio text) while still controlling the bio's clamp
 * state — the two live in different flex columns, so the expanded/collapsed
 * state has to be owned by a common parent rather than by the bio text
 * itself (which is why this isn't just <ExpandableText> reused twice).
 */
export function PersonHero({
  photoSrc,
  name,
  birthdayLabel,
  placeOfBirth,
  bio,
}: {
  photoSrc?: string | null;
  name: string;
  birthdayLabel: string | null;
  placeOfBirth: string | null;
  bio: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = !!bio && bio.length > LONG_TEXT_THRESHOLD;

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
      <div className="w-40 shrink-0 sm:w-56">
        <PersonPortrait src={photoSrc} name={name} />
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="mt-2 w-full text-center text-xs font-medium text-accent hover:brightness-110"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>

      <div className="flex-1">
        <h1 className="text-2xl font-semibold sm:text-3xl">{name}</h1>
        {(birthdayLabel || placeOfBirth) && (
          <p className="mt-1 text-sm text-foreground-muted">
            {birthdayLabel}
            {birthdayLabel && placeOfBirth && " · "}
            {placeOfBirth}
          </p>
        )}
        {bio ? (
          <p
            className={cn("mt-4 whitespace-pre-line text-sm leading-relaxed text-foreground-muted")}
            style={
              isLong && !expanded
                ? { display: "-webkit-box", WebkitLineClamp: CLAMPED_LINES, WebkitBoxOrient: "vertical", overflow: "hidden" }
                : undefined
            }
          >
            {bio}
          </p>
        ) : (
          <p className="mt-4 text-sm text-foreground-muted">No biography available yet.</p>
        )}
      </div>
    </div>
  );
}
