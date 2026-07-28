"use client";

import { useState, useTransition } from "react";
import { RatingStars } from "@/components/ui/rating-stars";
import { rateTitle } from "@/lib/actions/social";

export function RateControl({ titleId, initialScore = 0 }: { titleId: string; initialScore?: number }) {
  const [score, setScore] = useState(initialScore);
  const [isPending, startTransition] = useTransition();

  function handleChange(next: number) {
    setScore(next);
    startTransition(async () => {
      try {
        await rateTitle({ titleId, score: next });
      } catch {
        setScore(initialScore);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <RatingStars value={score} onChange={handleChange} size={24} />
      {isPending && <span className="text-xs text-foreground-muted">Saving…</span>}
    </div>
  );
}
