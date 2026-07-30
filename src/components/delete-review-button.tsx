"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteReview } from "@/lib/actions/social";

// A second click is required to actually delete — this is the one place in
// the review flow where a mis-click is otherwise unrecoverable (unlike a
// rating, which is a single tap to redo), so a lightweight "sure?" step
// beats a full modal for something this low-stakes.
export function DeleteReviewButton({ reviewId }: { reviewId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [hidden, setHidden] = useState(false);
  const router = useRouter();

  if (hidden) return null;

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteReview(reviewId);
        setHidden(true);
        router.refresh();
      } catch {
        setConfirming(false);
      }
    });
  }

  if (confirming) {
    return (
      <span className="flex items-center gap-2 text-xs">
        <span className="text-foreground-muted">Delete this review?</span>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          className="text-danger hover:underline disabled:opacity-50"
        >
          {isPending ? "Deleting…" : "Yes, delete"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={isPending}
          className="text-foreground-muted hover:text-foreground"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="text-xs text-foreground-muted hover:text-danger"
      title="Remove this review — your star rating (if any) is kept"
    >
      Delete
    </button>
  );
}
