"use client";

import { useState, useTransition } from "react";
import { RatingStars } from "@/components/ui/rating-stars";
import { rateTitle, unrateTitle } from "@/lib/actions/social";
import { posthog } from "@/lib/analytics/posthog-client";
import { useToast } from "@/components/ui/toast";

export function RateControl({ titleId, initialScore = 0 }: { titleId: string; initialScore?: number }) {
  const [score, setScore] = useState(initialScore);
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();

  function handleChange(next: number) {
    const previous = score;
    setScore(next);
    startTransition(async () => {
      try {
        const { breakthrough } = await rateTitle({ titleId, score: next });
        posthog.capture("title_rated", { title_id: titleId, score: next });
        if (breakthrough) {
          showToast(`Your first love for ${breakthrough.genre} — your taste just expanded`);
        }
      } catch {
        setScore(previous);
      }
    });
  }

  function handleRemove() {
    const previous = score;
    setScore(0);
    startTransition(async () => {
      try {
        await unrateTitle(titleId);
      } catch {
        setScore(previous);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <RatingStars value={score} onChange={handleChange} size={32} />
      {isPending && <span className="text-xs text-foreground-muted">Saving…</span>}
      {!isPending && score > 0 && (
        <button
          type="button"
          onClick={handleRemove}
          className="text-xs text-foreground-muted hover:text-danger"
          title="Undo — remove this rating and mark as not watched"
        >
          Remove
        </button>
      )}
    </div>
  );
}
