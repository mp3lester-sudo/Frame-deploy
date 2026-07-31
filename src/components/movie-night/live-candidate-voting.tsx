"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "@/components/ui/fade-image";
import { Button } from "@/components/ui/button";
import {
  castMovieNightVote,
  decideMovieNight,
  getMovieNightCandidates,
  getMovieNightMatches,
  getMovieNightFallbackRanking,
  refillMovieNightCandidate,
  type MovieNightMatchResult,
  type MovieNightFallbackResult,
} from "@/lib/actions/movie-night";
import { createClient } from "@/lib/supabase/client";
import type { MovieNightCandidate } from "@/lib/recommendations/movie-night";
import { WhyThisPick } from "@/components/home/why-this-pick";
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
// tally update live via Supabase Realtime. Voting (like OR pass) on a card
// refills that grid slot from the deeper personalized pool instead of
// leaving a dead card behind -- see refillMovieNightCandidate. The moment
// everyone's liked the same title it surfaces as its own "match" above the
// grid (getMovieNightMatches), separate from having to eyeball per-card
// tallies. If a viewer's queue runs dry with no unanimous match, the most
// agreed-upon titles so far take over as a fallback (getMovieNightFallbackRanking).
export function LiveCandidateVoting({
  movieNightId,
  candidates: initialCandidates,
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
  // Candidates now live in state rather than being read straight from
  // props -- anyone's preference change (mood/excluded genres) or the
  // roster changing (someone invited/removed) re-scores the shared pool
  // for everyone still on this screen, updated in place below instead of
  // via router.refresh()'s full-route reload.
  const [candidates, setCandidates] = useState(initialCandidates);
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
  const [matches, setMatches] = useState<MovieNightMatchResult[]>([]);
  const [refillingIds, setRefillingIds] = useState<Set<string>>(new Set());
  // Once a refill request comes back empty for this viewer, there's
  // nothing left in their personalized pool -- no point retrying on every
  // subsequent vote, so this latches true and the fallback ranking takes
  // over instead.
  const [poolExhausted, setPoolExhausted] = useState(false);
  const [fallback, setFallback] = useState<MovieNightFallbackResult[]>([]);

  const refreshMatches = useCallback(() => {
    startTransition(async () => {
      const fresh = await getMovieNightMatches(movieNightId);
      setMatches(fresh);
    });
  }, [movieNightId]);

  const refreshFallback = useCallback(() => {
    startTransition(async () => {
      const fresh = await getMovieNightFallbackRanking(movieNightId);
      setFallback(fresh);
    });
  }, [movieNightId]);

  // Matches can already exist from votes cast before this load (or before
  // a reload) -- check once on mount rather than waiting for the next
  // live vote event.
  useEffect(() => {
    refreshMatches();
  }, [refreshMatches]);

  useEffect(() => {
    if (poolExhausted) refreshFallback();
  }, [poolExhausted, refreshFallback]);

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
          // Someone else's vote (or ours, echoed back) can be the one that
          // completes a match -- recheck every time rather than trying to
          // guess locally whether this specific event was the deciding one.
          refreshMatches();
          if (poolExhausted) refreshFallback();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "movie_nights", filter: `id=eq.${movieNightId}` },
        // A status change (decided/cancelled/reopened) swaps which whole
        // section of the page renders -- that's a real full-route
        // transition, not something this component's own state can patch.
        () => router.refresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "movie_night_participants", filter: `movie_night_id=eq.${movieNightId}` },
        () => {
          startTransition(async () => {
            const fresh = await getMovieNightCandidates(movieNightId);
            setCandidates(fresh);
            // The roster (or someone's filters) just changed, so the pool
            // this viewer was exhausted on may not be anymore -- give the
            // refill queue another shot instead of staying stuck on the
            // fallback ranking.
            setPoolExhausted(false);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [movieNightId, router, poolExhausted, refreshMatches, refreshFallback]);

  function refillSlot(titleId: string) {
    if (poolExhausted) return;
    setRefillingIds((prev) => new Set(prev).add(titleId));
    const excludeTitleIds = candidates.map((c) => c.title.id);
    startTransition(async () => {
      const replacement = await refillMovieNightCandidate(movieNightId, excludeTitleIds);
      setCandidates((prev) => {
        if (!replacement) return prev.filter((c) => c.title.id !== titleId);
        return prev.map((c) => (c.title.id === titleId ? replacement : c));
      });
      if (!replacement) setPoolExhausted(true);
      setRefillingIds((prev) => {
        const next = new Set(prev);
        next.delete(titleId);
        return next;
      });
    });
  }

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
      refreshMatches();
    });
    // Whichever way you voted, you're done considering this one -- pull in
    // something new rather than leaving a decided card sitting there.
    refillSlot(titleId);
  }

  function lockIn(titleId: string) {
    setDecidingId(titleId);
    startTransition(async () => {
      await decideMovieNight({ movieNightId, titleId });
      router.refresh();
    });
  }

  const matchedIds = new Set(matches.map((m) => m.title.id));
  const visibleCandidates = candidates.filter((c) => !matchedIds.has(c.title.id));

  return (
    <div className="space-y-6">
      {matches.length > 0 && (
        <div className="rounded-[var(--radius-md)] border border-accent/50 bg-accent/5 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-accent">
            {matches.length === 1 ? "It's a match" : `${matches.length} matches`} — everyone liked{" "}
            {matches.length === 1 ? "this" : "these"}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
            {matches.map((m) => (
              <div key={m.title.id}>
                <div className="relative aspect-[2/3] overflow-hidden rounded-[var(--radius-sm)] border border-accent/40 bg-surface-raised">
                  {m.title.poster_url && (
                    <Image
                      src={m.title.poster_url}
                      alt={m.title.name}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 33vw, 160px"
                    />
                  )}
                </div>
                <p className="mt-1.5 line-clamp-1 text-xs font-medium">{m.title.name}</p>
                {isHost && (
                  <Button
                    size="sm"
                    variant="primary"
                    className="mt-1 w-full"
                    disabled={isPending}
                    isLoading={isPending && decidingId === m.title.id}
                    onClick={() => lockIn(m.title.id)}
                  >
                    Lock this in
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {visibleCandidates.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {visibleCandidates
            .map((c) => {
              const tally = votes[c.title.id] ?? { like: new Set<string>(), pass: new Set<string>() };
              const myVote = tally.like.has(viewerId) ? "like" : tally.pass.has(viewerId) ? "pass" : null;
              const isRefilling = refillingIds.has(c.title.id);

              return (
                <div key={c.title.id} className={isRefilling ? "opacity-40 transition-opacity" : "transition-opacity"}>
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
                  <WhyThisPick detail={c.detail} />

                  <p className="mt-1.5 text-[11px] text-foreground-muted">
                    {tally.like.size} liked{tally.pass.size > 0 ? ` · ${tally.pass.size} passed` : ""}
                    {participantCount > 0 && ` of ${participantCount}`}
                  </p>

                  <div className="mt-2 flex gap-1.5">
                    <Button
                      size="sm"
                      variant={myVote === "like" ? "primary" : "secondary"}
                      className="flex-1"
                      disabled={isPending || isRefilling}
                      onClick={() => castVote(c.title.id, "like")}
                    >
                      Like
                    </Button>
                    <Button
                      size="sm"
                      variant={myVote === "pass" ? "secondary" : "ghost"}
                      className="flex-1"
                      disabled={isPending || isRefilling}
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
      )}

      {visibleCandidates.length === 0 && matches.length === 0 && (
        <div>
          <p className="text-sm text-foreground-muted">
            {poolExhausted
              ? "That's everyone we could find matching your filters, with no unanimous pick yet."
              : "No candidates yet — invite at least one person, or wait until the catalogue has more titles."}
          </p>
          {fallback.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-foreground-muted">
                Most liked so far
              </p>
              <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
                {fallback.map((f) => (
                  <div key={f.title.id}>
                    <div className="relative aspect-[2/3] overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface-raised">
                      {f.title.poster_url && (
                        <Image
                          src={f.title.poster_url}
                          alt={f.title.name}
                          fill
                          className="object-cover"
                          sizes="(max-width: 640px) 33vw, 200px"
                        />
                      )}
                    </div>
                    <p className="mt-2 line-clamp-1 text-sm font-medium">{f.title.name}</p>
                    <p className="mt-0.5 text-[11px] text-foreground-muted">
                      {f.likeCount} liked{participantCount > 0 && ` of ${participantCount}`}
                    </p>
                    {isHost && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="mt-1.5 w-full"
                        disabled={isPending}
                        isLoading={isPending && decidingId === f.title.id}
                        onClick={() => lockIn(f.title.id)}
                      >
                        Lock this in
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {poolExhausted && fallback.length === 0 && isHost && (
            <p className="mt-3 text-xs text-foreground-muted">
              Nobody's liked anything yet either — try loosening a genre exclusion in preferences above, or invite
              someone new.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
