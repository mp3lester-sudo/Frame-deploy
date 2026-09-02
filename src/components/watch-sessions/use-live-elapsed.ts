"use client";

import { useEffect, useState } from "react";
import { computeElapsedSeconds } from "@/lib/watch-sessions/progress";
import type { WatchSessionRow } from "@/lib/watch-sessions/actions";

/**
 * Ticks a live elapsed-seconds number off `session`'s timestamps alone --
 * one setInterval per mounted progress row, zero network requests. Only
 * ticks while the session is actually "playing"; paused/completed/
 * abandoned sessions resolve once and stay put, exactly like
 * computeElapsedSeconds itself.
 */
export function useLiveElapsed(session: Pick<WatchSessionRow, "status" | "accumulated_seconds" | "started_at"> | null): number {
  const [elapsed, setElapsed] = useState(() => (session ? session.accumulated_seconds : 0));

  // React's own "adjusting state when a prop changes" pattern (setState
  // during render, guarded by an identity check) rather than an effect --
  // deliberately uses the static accumulated_seconds baseline, not
  // Date.now(), so this stays pure during render (this repo's lint config
  // flags impure calls in the render body; see ask-slate-client.tsx for
  // the same constraint on a similar ticking pattern). That baseline is
  // exactly correct at the instant a session starts/resumes (started_at
  // is "now", so the current segment is ~0s); the effect below corrects
  // it to the true live value within a second for the one case where it
  // isn't -- reopening a page onto an already-playing session.
  const [prevSession, setPrevSession] = useState(session);
  if (session !== prevSession) {
    setPrevSession(session);
    setElapsed(session ? session.accumulated_seconds : 0);
  }

  useEffect(() => {
    if (!session || session.status !== "playing") return;
    const id = setInterval(() => {
      setElapsed(computeElapsedSeconds(toInput(session), Date.now()));
    }, 1000);
    return () => clearInterval(id);
  }, [session]);

  return elapsed;
}

function toInput(session: Pick<WatchSessionRow, "status" | "accumulated_seconds" | "started_at">) {
  return { status: session.status, accumulatedSeconds: session.accumulated_seconds, startedAt: session.started_at };
}
