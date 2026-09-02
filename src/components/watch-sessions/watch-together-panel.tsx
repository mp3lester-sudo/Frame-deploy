"use client";

import { useEffect, useState } from "react";
import { Play, Pause, Check } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { PressPlayButton } from "@/components/watch-sessions/press-play-button";
import { WatchProgressBar } from "@/components/watch-sessions/watch-progress-bar";
import { useLiveElapsed } from "@/components/watch-sessions/use-live-elapsed";
import { createClient } from "@/lib/supabase/client";
import { getMovieNightWatchSessions, type MovieNightWatchSessionRow, type WatchSessionRow } from "@/lib/watch-sessions/actions";

/**
 * "Press Play with us" -- the group counterpart to the solo movie-page
 * button. Everyone in a Movie Night can start their own self-reported
 * timer against the same decided pick and watch each other's live
 * progress, the same "no real player, honest self-reported clock"
 * mechanic as PressPlayButton, just with a roster.
 *
 * Subscribes to the same postgres_changes pattern LiveParticipants uses
 * for the roster: any insert/update to a watch_sessions row for this
 * night refetches the whole list and re-renders it, so everyone sees
 * everyone else pressing Play / pausing / finishing without a refresh --
 * this is what makes it feel "simultaneous" despite each person's clock
 * being a separate row.
 */
export function WatchTogetherPanel({
  movieNightId,
  titleId,
  runtimeMinutes,
  currentUserId,
  initialSessions,
}: {
  movieNightId: string;
  titleId: string;
  runtimeMinutes: number | null;
  currentUserId: string;
  initialSessions: MovieNightWatchSessionRow[];
}) {
  const [sessions, setSessions] = useState(initialSessions);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`watch-together-${movieNightId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "watch_sessions", filter: `movie_night_id=eq.${movieNightId}` },
        () => {
          getMovieNightWatchSessions(movieNightId).then(setSessions);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [movieNightId]);

  const mySession = sessions.find((s) => s.user_id === currentUserId) ?? null;
  const others = sessions.filter((s) => s.user_id !== currentUserId);

  function handleMySessionChange(next: WatchSessionRow | null) {
    // Optimistic local mirror so the person who just acted doesn't wait on
    // their own realtime round-trip -- everyone else still gets it via
    // the subscription above.
    setSessions((current) => {
      const withoutMine = current.filter((s) => s.user_id !== currentUserId);
      if (!next) return withoutMine;
      const mine = mySession ? { ...next, profiles: mySession.profiles } : ({ ...next, profiles: null } as MovieNightWatchSessionRow);
      return [...withoutMine, mine];
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-border bg-surface p-5">
      <div>
        <p className="text-sm font-medium">Watch together</p>
        <p className="text-xs text-foreground-muted">
          Press Play at the same time and watch everyone&apos;s progress live.
        </p>
      </div>

      <PressPlayButton
        titleId={titleId}
        runtimeMinutes={runtimeMinutes}
        initialSession={mySession}
        movieNightId={movieNightId}
        onSessionChange={handleMySessionChange}
      />

      {others.length > 0 && (
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          {others.map((s) => (
            <ParticipantRow key={s.id} session={s} runtimeMinutes={runtimeMinutes} />
          ))}
        </div>
      )}
    </div>
  );
}

function ParticipantRow({ session, runtimeMinutes }: { session: MovieNightWatchSessionRow; runtimeMinutes: number | null }) {
  const elapsed = useLiveElapsed(session);
  const name = session.profiles?.display_name ?? session.profiles?.username ?? "Someone";

  return (
    <div className="flex items-center gap-3">
      <Avatar name={name} src={session.profiles?.avatar_url} size={28} />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-1.5 text-xs">
          <span className="truncate font-medium">{name}</span>
          <StatusIcon status={session.status} />
        </div>
        <WatchProgressBar elapsedSeconds={elapsed} runtimeMinutes={runtimeMinutes} />
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: WatchSessionRow["status"] }) {
  if (status === "playing") return <Play className="h-3 w-3 fill-current text-accent" />;
  if (status === "paused") return <Pause className="h-3 w-3 text-foreground-muted" />;
  if (status === "completed") return <Check className="h-3 w-3 text-accent" />;
  return null;
}
