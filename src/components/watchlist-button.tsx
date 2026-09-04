"use client";

import { useState, useTransition } from "react";
import { Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addToWatchlist, removeFromWatchlist } from "@/lib/actions/lists";
import { posthog } from "@/lib/analytics/posthog-client";
import { useToast } from "@/components/ui/toast";

export function WatchlistButton({
  titleId,
  initiallyOnWatchlist,
}: {
  titleId: string;
  initiallyOnWatchlist: boolean;
}) {
  const [onWatchlist, setOnWatchlist] = useState(initiallyOnWatchlist);
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();

  // Launch audit finding: failures here reverted silently with no toast,
  // inconsistent with the app's own established toast pattern (see
  // rate-control.tsx) -- fixed to match.
  function handleClick() {
    const next = !onWatchlist;
    setOnWatchlist(next);
    if (next) posthog.capture("title_watchlisted", { title_id: titleId });
    startTransition(async () => {
      try {
        await (next ? addToWatchlist(titleId) : removeFromWatchlist(titleId));
      } catch {
        setOnWatchlist(!next);
        showToast("Couldn't update your watchlist — try again");
      }
    });
  }

  return (
    <Button
      variant={onWatchlist ? "secondary" : "ghost"}
      size="sm"
      isLoading={isPending}
      onClick={handleClick}
      className={onWatchlist ? "border-accent/50 text-accent" : ""}
    >
      <Bookmark size={14} fill={onWatchlist ? "currentColor" : "none"} />
      {onWatchlist ? "On Watchlist" : "Watchlist"}
    </Button>
  );
}
