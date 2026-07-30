"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "@/components/ui/fade-image";
import { Button } from "@/components/ui/button";
import { castMovieNightVote, decideMovieNight } from "@/lib/actions/movie-night";
import { createClient } from "@/lib/supabase/client";
import type { MovieNightCandidate } from "@/lib/recommendations/movie-night";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

export interface InitialVote {
  title_id: string;
  user_id: string;
  vote: "like" | "pass";
}

interface VoteRow {
  title_id: string;
  user_id: string;
  vote: "like" | "pass";
}

// Every participant votes on the same shared candidate pool and watches the
// tally update live via Supabase Realtime — this replaces the old
// host-only CandidatePicker, which only the host ever saw. The host still
// makes the final call (lockIn below), just informed by the group's actual
// live consensus instead of guessing blind.
export function LiveCandidateVoting({
  movieNightId,
  candidates,
  initialVotes,
  viewerId,
  isHost,
  participantCount,
}: {
  movieNightId: string;
  candidates: MovieNightCandidate[];
  initialVotes: InitialVote[];
  viewerId: string;
  isHost: boolean;
  participantCount: number;
}) {
  const router = useRouter();
  const [votes, setVotes] = useState<Record<string, { like: Set<string>; pass: Set<string> }>>(() => {
    const map: Record<string, { like: Set<string>; pass: Set<string> }> = {};
    for (const v of initialVotes) {
      map[v.title_id] ??= { like: new Set(), pass: new Set() };
      map[v.title_id][v.vote].add(v.user_id);
    }
    return map;
  });
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`movie-night-${movieNightId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "movie_night_votes", filter: `movie_night_id=eq.${movieNightId}` },
        (payload: RealtimePostgresChangesPayload<VoteRow>) => {
          const row = (payload.new && "title_id" in payload.new ? payload.new : payload.old) as
            | VoteRow
            | undefined;
          if (!row || !("title_id" in row)) return;
          setVotes((prev) => {
            const next = { ...prev };
            const entry = next[row.title_id] ?? { like: new Set<string>(), pass: new Set<string>() };
            const liked = new Set(entry.like);
            const passed = new Set(entry.pass);
            liked.delete(row.user_id);
            passed.delete(row.user_id);
            if (payload.eventType !== "DELETE") {
              (row.vote === "like" ? liked : passed).add(row.user_id);
            }
            next[row.title_id] = { like: liked, pass: passed };
            return next;
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "movie_nights", filter: `id=eq.${movieNightId}` },
        () => router.refresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "movie_night_participants", filter: `movie_night_id=eq.${movieNightId}` },
        () => router.refresh()
      )
      .subscribe((status, err) => {
        // Temporary diagnostic logging while verifying the Realtime wiring
        // end-to-end for the first time in this codebase — safe to remove
        // once confirmed working across two real sessions.
        console.log("[movie-night realtime] subscribe status:", status, err ?? "");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [movieNightId, router]);

  function castVote(titleId: string, vote: "like" | "pass") {
    // Optimistic local update — the Realtime echo for our own vote will
    // arrive a moment later and is a no-op against this same state.
    setVotes((prev) => {
      const entry = prev[titleId] ?? { like: new Set<string>(), pass: new Set<string>() };
      const liked = new Set(entry.like);
      const passed = new Set(entry.pass);
      liked.delete(viewerId);
      passed.delete(viewerId);
      (vote === "like" ? liked : passed).add(viewerId);
      return { ...prev, [titleId]: { like: liked, pass: passed } };
    });
    startTransition(async () => {
      await castMovieNightVote({ movieNightId, titleId, vote });
    });
  }

  function lockIn(titleId: string) {
    setDecidingId(titleId);
    startTransition(async () => {
      await decideMovieNight({ movieNightId, titleId });
      router.refresh();
    });
  }

  if (!candidates.length) {
    return (
      <p className="text-sm text-foreground-muted">
        No candidates yet — invite at least one person, or wait until the catalogue has more titles.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {candidates.map((c) => {
        const tally = votes[c.title.id] ?? { like: new Set<string>(), pass: new Set<string>() };
        const myVote = tally.like.has(viewerId) ? "like" : tally.pass.has(viewerId) ? "pass" : null;

        return (
          <div key={c.title.id}>
            <div className="relative aspect-[2/3] overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface-raised">
              {c.title.poster_url && (
                <Image
                  src={c.title.poster_url}
                  alt={c.title.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 33vw, 200px"
                />
              )}
            </div>
            <p className="mt-2 line-clamp-1 text-sm font-medium">{c.title.name}</p>
            <p className="mt-0.5 line-clamp-2 text-xs text-foreground-muted">{c.note}</p>

            <p className="mt-1.5 text-[11px] text-foreground-muted">
              {tally.like.size} liked{tally.pass.size > 0 ? ` · ${tally.pass.size} passed` : ""}
              {participantCount > 0 && ` of ${participantCount}`}
            </p>

            <div className="mt-2 flex gap-1.5">
              <Button
                size="sm"
                variant={myVote === "like" ? "primary" : "secondary"}
                className="flex-1"
                disabled={isPending}
                onClick={() => castVote(c.title.id, "like")}
              >
                Like
              </Button>
              <Button
                size="sm"
                variant={myVote === "pass" ? "secondary" : "ghost"}
                className="flex-1"
                disabled={isPending}
                onClick={() => castVote(c.title.id, "pass")}
              >
                Pass
              </Button>
            </div>

            {isHost && (
              <Button
                size="sm"
                variant="secondary"
                className="mt-1.5 w-full"
                disabled={isPending}
                isLoading={isPending && decidingId === c.title.id}
                onClick={() => lockIn(c.title.id)}
              >
                Lock this in
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
