"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";
import { getMovieNightParticipants, type MovieNightParticipantRow } from "@/lib/actions/movie-night";

/**
 * The avatar/name chip row at the top of a Movie Night. Previously this was
 * rendered straight from the server-loaded `participants` prop with no way
 * to update itself -- inviting someone only showed up for people who
 * already had the page open once they (or something else) forced a full
 * page reload. Now it subscribes to the same movie_night_participants
 * Realtime table LiveCandidateVoting watches for its own candidate
 * refresh, and re-fetches just this roster in place when anyone is
 * invited, removed, or updates their mood -- no router.refresh().
 */
export function LiveParticipants({
  movieNightId,
  hostId,
  initialParticipants,
}: {
  movieNightId: string;
  hostId: string;
  initialParticipants: MovieNightParticipantRow[];
}) {
  const [participants, setParticipants] = useState(initialParticipants);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`movie-night-roster-${movieNightId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "movie_night_participants", filter: `movie_night_id=eq.${movieNightId}` },
        () => {
          getMovieNightParticipants(movieNightId).then(setParticipants);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [movieNightId]);

  return (
    <div className="mt-4 flex flex-wrap gap-3">
      {participants.map((p) => (
        <div
          key={p.user_id}
          className="flex items-center gap-2 rounded-[var(--radius-full)] border border-border bg-surface py-1.5 pl-1.5 pr-3"
        >
          <Avatar name={p.profiles?.display_name ?? p.profiles?.username ?? "?"} src={p.profiles?.avatar_url} size={24} />
          <span className="text-xs">
            {p.profiles?.display_name ?? p.profiles?.username ?? "Unknown"}
            {p.user_id === hostId && " (host)"}
          </span>
          {p.mood && <span className="text-[11px] text-foreground-muted">&middot; {p.mood}</span>}
        </div>
      ))}
    </div>
  );
}
