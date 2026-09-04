"use client";

import { useState, useTransition } from "react";
import { setReviewReaction } from "@/lib/actions/reactions";
import { REVIEW_REACTIONS, REVIEW_REACTION_LABELS, type ReviewReaction } from "@/lib/constants/social";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

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
  const { showToast } = useToast();

  // Launch audit finding: setReviewReaction was unguarded -- same class
  // of bug as follow-button.tsx. Revert both the optimistic count and
  // the active-reaction highlight on failure, matching the revert
  // pattern rate-control.tsx/watchlist-button.tsx already use.
  function handleClick(reaction: ReviewReaction) {
    if (!canReact) return;
    const previousCounts = counts;
    const previousReaction = myReaction;
    const next = myReaction === reaction ? null : reaction;

    setCounts((prev) => {
      const updated = { ...prev };
      if (myReaction) updated[myReaction] = Math.max(0, updated[myReaction] - 1);
      if (next) updated[next] = (updated[next] ?? 0) + 1;
      return updated;
    });
    setMyReaction(next);

    startTransition(async () => {
      try {
        await setReviewReaction(reviewId, next);
      } catch {
        setCounts(previousCounts);
        setMyReaction(previousReaction);
        showToast("Couldn't save your reaction — try again");
      }
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
