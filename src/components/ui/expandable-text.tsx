"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Below this length, a bio just renders as a normal paragraph — no toggle
 *  UI at all for the common case of a short, already-tidy bio. Above it,
 *  clamp to a few lines and offer a "Show more" toggle rather than dumping
 *  a wall of text (some TMDB bios run to multiple paragraphs). */
const LONG_TEXT_THRESHOLD = 380;
const CLAMPED_LINES = 5;

export function ExpandableText({ text, className }: { text: string; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > LONG_TEXT_THRESHOLD;

  return (
    <div>
      <p
        className={cn("whitespace-pre-line", className)}
        style={isLong && !expanded ? { display: "-webkit-box", WebkitLineClamp: CLAMPED_LINES, WebkitBoxOrient: "vertical", overflow: "hidden" } : undefined}
      >
        {text}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-1.5 text-xs font-medium text-accent hover:brightness-110"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
