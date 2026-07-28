"use client";

import { useState, useTransition } from "react";
import { setReviewReaction } from "@/lib/actions/reactions";
import { REVIEW_REACTIONS, REVIEW_REACTION_LABELS, type ReviewReaction } from "@/lib/constants/social";
import { cn } from "@/lib/utils";

export function ReviewReactionBar({
  reviewId,
  initialCounts,
  initialMyReaction,
  canReact,
}: {
  reviewId: string;
  initialCounts: Record<ReviewReaction, number>;
  initialMyReaction: ReviewReaction | null;
  canReact: boolean;
}) {
  const [counts, setCounts] = useState(initialCounts);
  const [myReaction, setMyReaction] = useState(initialMyReaction);
  const [isPending, startTransition] = useTransition();

  function handleClick(reaction: ReviewReaction) {
    if (!canReact) return;
    const next = myReaction === reaction ? null : reaction;

    setCounts((prev) => {
      const updated = { ...prev };
      if (myReaction) updated[myReaction] = Math.max(0, updated[myReaction] - 1);
      if (next) updated[next] = (updated[next] ?? 0) + 1;
      return updated;
    });
    setMyReaction(next);

    startTransition(async () => {
      await setReviewReaction(reviewId, next);
    });
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {REVIEW_REACTIONS.map((reaction) => {
        const active = myReaction === reaction;
        const count = counts[reaction] ?? 0;
        return (
          <button
            key={reaction}
            type="button"
            disabled={isPending || !canReact}
            onClick={() => handleClick(reaction)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition-colors disabled:cursor-default",
              active
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-foreground-muted hover:enabled:text-foreground hover:enabled:border-foreground-muted"
            )}
          >
            {REVIEW_REACTION_LABELS[reaction]}
            {count > 0 ? ` · ${count}` : ""}
          </button>
        );
      })}
    </div>
  );
}
