"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { blockUser, unblockUser } from "@/lib/actions/moderation";

/**
 * Toggle button for the profile page's Follow/Message row. A second click
 * is required to actually block -- same "sure?" pattern as
 * DeleteReviewButton -- since blocking someone is a more consequential,
 * less easily-undone-by-accident action than following/unfollowing.
 */
export function BlockUserButton({ userId, initiallyBlocked }: { userId: string; initiallyBlocked: boolean }) {
  const [blocked, setBlocked] = useState(initiallyBlocked);
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleBlock() {
    setConfirming(false);
    startTransition(async () => {
      try {
        await blockUser(userId);
        setBlocked(true);
      } catch {
        // Left unblocked in local state -- the button just stays as-is.
      }
    });
  }

  function handleUnblock() {
    startTransition(async () => {
      try {
        await unblockUser(userId);
        setBlocked(false);
      } catch {
        // Stays blocked in local state on failure.
      }
    });
  }

  if (blocked) {
    return (
      <Button variant="ghost" size="sm" isLoading={isPending} onClick={handleUnblock}>
        Unblock
      </Button>
    );
  }

  if (confirming) {
    return (
      <span className="flex items-center gap-2 text-xs">
        <span className="text-foreground-muted">Block this user?</span>
        <button type="button" onClick={handleBlock} disabled={isPending} className="text-danger hover:underline">
          {isPending ? "Blocking…" : "Yes, block"}
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
    <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
      Block
    </Button>
  );
}
