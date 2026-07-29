"use client";

import { useState, useTransition } from "react";
import { Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addToWatchlist, removeFromWatchlist } from "@/lib/actions/lists";

export function WatchlistButton({
  titleId,
  initiallyOnWatchlist,
}: {
  titleId: string;
  initiallyOnWatchlist: boolean;
}) {
  const [onWatchlist, setOnWatchlist] = useState(initiallyOnWatchlist);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const next = !onWatchlist;
    setOnWatchlist(next);
    startTransition(async () => {
      try {
        await (next ? addToWatchlist(titleId) : removeFromWatchlist(titleId));
      } catch {
        setOnWatchlist(!next);
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
