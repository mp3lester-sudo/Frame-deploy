"use client";

import { useState, useTransition } from "react";
import { Play, Pause, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RatingStars } from "@/components/ui/rating-stars";
import { WatchProgressBar } from "@/components/watch-sessions/watch-progress-bar";
import { useLiveElapsed } from "@/components/watch-sessions/use-live-elapsed";
import { hasReachedRuntime } from "@/lib/watch-sessions/progress";
import {
  startWatchSession,
  pauseWatchSession,
  resumeWatchSession,
  completeWatchSession,
  abandonWatchSession,
  type WatchSessionRow,
} from "@/lib/watch-sessions/actions";
import { rateTitle } from "@/lib/actions/social";
import { useToast } from "@/components/ui/toast";

/**
 * Solo "Press Play" -- self-reported watch-progress tracking for a single
 * title, no Movie Night involved. Mirrors RateControl's optimistic-update
 * + useTransition shape: local state updates immediately, the server
 * action confirms in the background, and any failure just leaves the
 * previous state in place rather than showing a scary error.
 */
export function PressPlayButton({
  titleId,
  runtimeMinutes,
  initialSession,
  movieNightId,
  onSessionChange,
}: {
  titleId: string;
  runtimeMinutes: number | null;
  initialSession: WatchSessionRow | null;
  /** Set when this button is a Movie Night participant's own row inside
   *  WatchTogetherPanel rather than the solo Continue Watching CTA. */
  movieNightId?: string;
  /** Lets an embedding parent (WatchTogetherPanel) mirror this session's
   *  state into its own list immediately, rather than waiting on the
   *  realtime round-trip for the person who took the action. */
  onSessionChange?: (session: WatchSessionRow | null) => void;
}) {
  const [session, setSessionState] = useState(initialSession);
  const [isPending, startTransition] = useTransition();
  const [showRating, setShowRating] = useState(false);
  const { showToast } = useToast();
  const elapsed = useLiveElapsed(session);
  const finished = session?.status === "playing" && hasReachedRuntime(elapsed, runtimeMinutes);

  function setSession(next: WatchSessionRow | null) {
    setSessionState(next);
    onSessionChange?.(next);
  }

  function handleStart() {
    startTransition(async () => {
      try {
        const started = await startWatchSession({ titleId, movieNightId });
        setSession(started);
      } catch {
        showToast("Couldn't start tracking -- try again");
      }
    });
  }

  function handlePause() {
    if (!session) return;
    startTransition(async () => {
      try {
        setSession(await pauseWatchSession({ sessionId: session.id }));
      } catch {
        showToast("Couldn't pause -- try again");
      }
    });
  }

  function handleResume() {
    if (!session) return;
    startTransition(async () => {
      try {
        setSession(await resumeWatchSession({ sessionId: session.id }));
      } catch {
        showToast("Couldn't resume -- try again");
      }
    });
  }

  function handleComplete() {
    if (!session) return;
    startTransition(async () => {
      try {
        setSession(await completeWatchSession({ sessionId: session.id }));
        setShowRating(true);
      } catch {
        showToast("Couldn't mark as finished -- try again");
      }
    });
  }

  function handleAbandon() {
    if (!session) return;
    startTransition(async () => {
      try {
        await abandonWatchSession({ sessionId: session.id });
        setSession(null);
      } catch {
        showToast("Couldn't stop tracking -- try again");
      }
    });
  }

  function handleRate(score: number) {
    startTransition(async () => {
      try {
        await rateTitle({ titleId, score });
        showToast("Rating saved");
      } catch {
        showToast("Couldn't save rating");
      }
    });
    setShowRating(false);
  }

  if (session?.status === "completed" && !showRating) {
    return (
      <div className="flex items-center gap-2 text-sm text-foreground-muted">
        <Check className="h-4 w-4 text-accent" />
        <span>Watched -- {formattedCompletedNote(session)}</span>
      </div>
    );
  }

  if (showRating) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-foreground-muted">How was it?</p>
        <RatingStars value={0} onChange={handleRate} size={28} />
      </div>
    );
  }

  if (!session) {
    return (
      <Button onClick={handleStart} isLoading={isPending} variant="primary">
        <Play className="h-4 w-4 fill-current" />
        {movieNightId ? "Press Play with everyone" : "Press Play"}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{session.status === "playing" ? "Now watching" : "Paused"}</p>
        <button
          type="button"
          onClick={handleAbandon}
          disabled={isPending}
          className="text-foreground-muted hover:text-danger"
          title="Stop tracking this watch"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <WatchProgressBar elapsedSeconds={elapsed} runtimeMinutes={runtimeMinutes} />

      <div className="flex items-center gap-2">
        {session.status === "playing" ? (
          <Button onClick={handlePause} isLoading={isPending} variant="secondary" size="sm">
            <Pause className="h-3.5 w-3.5" />
            Pause
          </Button>
        ) : (
          <Button onClick={handleResume} isLoading={isPending} variant="secondary" size="sm">
            <Play className="h-3.5 w-3.5 fill-current" />
            Resume
          </Button>
        )}
        <Button
          onClick={handleComplete}
          isLoading={isPending}
          variant={finished ? "primary" : "ghost"}
          size="sm"
        >
          <Check className="h-3.5 w-3.5" />
          {finished ? "Finished!" : "Mark as finished"}
        </Button>
      </div>
    </div>
  );
}

function formattedCompletedNote(session: WatchSessionRow): string {
  if (!session.completed_at) return "just now";
  const days = Math.floor((Date.now() - new Date(session.completed_at).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}
