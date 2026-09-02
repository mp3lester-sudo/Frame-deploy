/**
 * Pure math for the "Press Play" watch-progress feature -- no I/O, no
 * Supabase, no clock reads beyond the `nowMs` parameter callers pass in
 * (so tests never depend on real wall-clock time).
 *
 * Slate has no player of its own -- Where to Watch only ever deep-links
 * out to a streaming app -- so there's no real playback position to read
 * back. This is a deliberately honest self-reported timer instead: a
 * session tracks `accumulatedSeconds` (everything banked from prior
 * playing segments) plus `startedAt` (when the *current* playing segment
 * began, only meaningful while status is "playing"). Pausing folds the
 * current segment into accumulatedSeconds; resuming starts a fresh
 * segment. This means elapsed time is always a pure function of
 * (status, accumulatedSeconds, startedAt, now) -- the client can tick a
 * live display every second purely off timestamps, with zero DB writes
 * in between start/pause/resume/complete events.
 */

export interface WatchSessionProgressInput {
  status: "playing" | "paused" | "completed" | "abandoned";
  accumulatedSeconds: number;
  /** ISO timestamp marking the start of the current playing segment.
   *  Ignored (elapsed time is just accumulatedSeconds) unless status is
   *  "playing". */
  startedAt: string;
}

/** Elapsed watch time in whole seconds, as of `nowMs`. Never goes
 *  backwards and never depends on anything other than its inputs. */
export function computeElapsedSeconds(session: WatchSessionProgressInput, nowMs: number): number {
  if (session.status !== "playing") return Math.max(0, Math.round(session.accumulatedSeconds));
  const startedAtMs = new Date(session.startedAt).getTime();
  // A clock skew or a stale/garbled startedAt could otherwise produce a
  // negative segment length -- floor the segment itself at 0 rather than
  // letting elapsed time run backwards mid-playback.
  const segmentSeconds = Math.max(0, (nowMs - startedAtMs) / 1000);
  return Math.max(0, Math.round(session.accumulatedSeconds + segmentSeconds));
}

/** 0-100, or null when the title has no known runtime (some TV entries,
 *  occasionally an unenriched movie) -- callers should show an
 *  open-ended running clock instead of a progress bar in that case,
 *  never a fake/guessed percentage. */
export function computeProgressPercent(elapsedSeconds: number, runtimeMinutes: number | null): number | null {
  if (!runtimeMinutes || runtimeMinutes <= 0) return null;
  const runtimeSeconds = runtimeMinutes * 60;
  return Math.max(0, Math.min(100, Math.round((elapsedSeconds / runtimeSeconds) * 100)));
}

/** Whether the self-reported clock has reached the title's own runtime --
 *  the one piece of "did they finish" signal this feature can honestly
 *  offer without a real player. Always false for unknown runtime; a
 *  session with no runtime can only ever be finished by an explicit
 *  "Mark as finished" action, never auto-detected. */
export function hasReachedRuntime(elapsedSeconds: number, runtimeMinutes: number | null): boolean {
  if (!runtimeMinutes || runtimeMinutes <= 0) return false;
  return elapsedSeconds >= runtimeMinutes * 60;
}

/** "1:02:47" past the hour mark, "42:17" under it -- always zero-padded
 *  seconds/minutes so the display doesn't jump width as digits change. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  // Minutes are always zero-padded, with or without an hours segment --
  // the doc comment above promises a stable width, and only padding
  // when h > 0 broke that promise for anything under 10 minutes (e.g.
  // 59 seconds rendered as "0:59" instead of "00:59").
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** "42 min left" / "1 min left" -- null when runtime is unknown (nothing
 *  to count down to) or once elapsed has already reached/passed it. */
export function formatRemaining(elapsedSeconds: number, runtimeMinutes: number | null): string | null {
  if (!runtimeMinutes || runtimeMinutes <= 0) return null;
  const remainingSeconds = runtimeMinutes * 60 - elapsedSeconds;
  if (remainingSeconds <= 0) return null;
  const remainingMinutes = Math.max(1, Math.round(remainingSeconds / 60));
  return `${remainingMinutes} min left`;
}
