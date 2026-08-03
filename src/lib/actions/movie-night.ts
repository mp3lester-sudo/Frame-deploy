"use server";

import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { notify } from "@/lib/actions/notifications";
import { captureServerError } from "@/lib/monitoring/sentry-server";
import { getCandidatesForMovieNight, type MovieNightCandidate } from "@/lib/recommendations/movie-night";
import { computeMatches, rankByLikeCount, type MovieNightVoteRecord } from "@/lib/recommendations/movie-night-matches";
import type { Database } from "@/lib/supabase/types";

type Title = Database["public"]["Tables"]["titles"]["Row"];

export interface MovieNightMatchResult {
  title: Title;
  likedBy: string[];
}

export interface MovieNightFallbackResult {
  title: Title;
  likeCount: number;
}

export interface MovieNightParticipantRow {
  user_id: string;
  mood: string | null;
  excluded_genres: string[];
  profiles: { username: string; display_name: string | null; avatar_url: string | null } | null;
}

async function requireUser() {
  const supabase = await createClient();
  // Trusts the user middleware already verified for this request (see
  // src/lib/auth/verified-user.ts) instead of calling
  // supabase.auth.getUser() again — that's a real network round trip to
  // Supabase's Auth server, so re-deriving it here on top of middleware
  // (and again after this action's revalidatePath re-renders the layout)
  // was tripling that latency on every single mutating button.
  const user = await getVerifiedUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

export async function createMovieNight() {
  const { supabase, user } = await requireUser();

  const { data: night, error } = await supabase
    .from("movie_nights")
    .insert({ host_id: user.id })
    .select("id")
    .single();
  if (error || !night) throw new Error(error?.message ?? "Could not create movie night");

  await supabase.from("movie_night_participants").insert({
    movie_night_id: night.id,
    user_id: user.id,
  });

  redirect(`/movie-night/${night.id}`);
}

const inviteSchema = z.object({
  movieNightId: z.string().uuid(),
  username: z
    .string()
    .min(1)
    .transform((s) => s.trim().toLowerCase().replace(/^@/, "")),
});

export async function inviteToMovieNight(input: z.infer<typeof inviteSchema>) {
  const { movieNightId, username } = inviteSchema.parse(input);
  const { supabase, user } = await requireUser();

  const { data: night } = await supabase
    .from("movie_nights")
    .select("host_id, status")
    .eq("id", movieNightId)
    .maybeSingle();
  if (!night) throw new Error("Movie night not found");
  if (night.host_id !== user.id) throw new Error("Only the host can invite people");
  if (night.status !== "collecting") throw new Error("This movie night is no longer collecting");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (!profile) throw new Error(`No user found with username "${username}"`);

  const { error } = await supabase.from("movie_night_participants").insert({
    movie_night_id: movieNightId,
    user_id: profile.id,
  });
  if (error) {
    if (error.code === "23505") throw new Error("That person is already invited");
    throw new Error(error.message);
  }

  await notify(supabase, {
    recipientId: profile.id,
    actorId: user.id,
    type: "movie_night_invite",
    refId: movieNightId,
  });

  revalidatePath(`/movie-night/${movieNightId}`);
}

const joinByTokenSchema = z.object({ token: z.string().min(1) });

/**
 * The other half of the invite story: joining via a shareable link
 * instead of inviteToMovieNight's by-username flow above, which only
 * works when the invitee is already a Backlot account. resolve_movie_night_token
 * (migration 0037) is security definer specifically so an authenticated
 * user who isn't a participant yet can still resolve the token -- movie_nights'
 * own RLS would otherwise hide the row from them. The actual participant
 * insert then goes through the ordinary "users join movie night as self"
 * policy (auth.uid() = user_id), no elevated privilege needed for that part.
 */
export async function joinMovieNightByToken(input: z.infer<typeof joinByTokenSchema>) {
  const { token } = joinByTokenSchema.parse(input);
  const { supabase, user } = await requireUser();

  const { data: rows } = await supabase.rpc("resolve_movie_night_token", { p_token: token });
  const night = rows?.[0];
  if (!night) throw new Error("This invite link isn't valid, or that movie night is no longer open");

  const { error } = await supabase
    .from("movie_night_participants")
    .insert({ movie_night_id: night.id, user_id: user.id });
  // 23505 (already a participant) is fine -- just take them to the session.
  if (error && error.code !== "23505") throw new Error(error.message);

  if (!error && night.host_id !== user.id) {
    await notify(supabase, {
      recipientId: night.host_id,
      actorId: user.id,
      type: "movie_night_invite",
      refId: night.id,
    });
  }

  revalidatePath(`/movie-night/${night.id}`);
  redirect(`/movie-night/${night.id}`);
}

const preferencesSchema = z.object({
  movieNightId: z.string().uuid(),
  mood: z.string().max(100).optional(),
  excludedGenres: z.array(z.string()).default([]),
});

export async function setMyMovieNightPreferences(
  input: z.infer<typeof preferencesSchema>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { movieNightId, mood, excludedGenres } = preferencesSchema.parse(input);
  const { supabase, user } = await requireUser();

  // .select() here is deliberate, not decorative: an RLS-blocked UPDATE
  // matches zero rows and reports success with no thrown error (see
  // migration 0034's note on this exact footgun) -- .select() is what lets
  // us actually see "0 rows" and surface it as a real failure instead of a
  // silent no-op that looks identical to a real save from the caller's side.
  //
  // Returned as a plain value rather than thrown: Next.js redacts thrown
  // Server Action errors down to a generic "digest" message in production
  // builds, which would hide the diagnostic detail this is here for.
  const { data, error } = await supabase
    .from("movie_night_participants")
    .update({ mood: mood || null, excluded_genres: excludedGenres })
    .eq("movie_night_id", movieNightId)
    .eq("user_id", user.id)
    .select("user_id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return {
      ok: false,
      error: `Preference save matched 0 rows (movie_night_id=${movieNightId}, user_id=${user.id}) -- likely blocked by RLS or the participant row doesn't exist.`,
    };
  }

  revalidatePath(`/movie-night/${movieNightId}`);
  return { ok: true };
}

// Live-refresh pair for LiveCandidateVoting / LiveParticipants: whenever
// anyone's mood, excluded genres, or the roster itself changes, every
// participant's already-open page picks this up over the same Realtime
// channel those components already subscribe to (see their postgres_changes
// listeners on movie_night_participants) and calls one of these to pull
// fresh data in place, instead of the previous router.refresh(), which
// re-rendered the entire route (banner, taste-comparison cards, the whole
// candidate grid) for what was really just "my genre filter changed."
export async function getMovieNightCandidates(movieNightId: string): Promise<MovieNightCandidate[]> {
  const { user } = await requireUser();
  return getCandidatesForMovieNight(movieNightId, { viewerId: user.id });
}

export interface TitleBasic {
  id: string;
  name: string;
  poster_url: string | null;
}

/**
 * Fallback lookup for the decision-reveal overlay (see DecisionReveal +
 * the movie_nights realtime handler in live-candidate-voting.tsx): most
 * of the time the decided title is already sitting in this viewer's own
 * matches/candidates/fallback state, no server round trip needed, but a
 * host can lock in a pick this particular viewer's personalized pool
 * never surfaced (different taste vector, different exclusions) -- this
 * covers that edge case with a minimal query rather than falling back to
 * a plain page reload and skipping the reveal entirely.
 */
export async function getTitleBasic(titleId: string): Promise<TitleBasic | null> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("titles").select("id, name, poster_url").eq("id", titleId).maybeSingle();
  return data;
}

/**
 * Refills a single grid slot in the candidate queue -- called the moment
 * a viewer votes (like or pass) on a card, so passing on something always
 * surfaces a fresh option instead of leaving a dead card behind. Excludes
 * the viewer's own vote history automatically (via viewerId) plus
 * whatever's already occupying other slots on their screen this session
 * (excludeTitleIds), so a single refill can't hand back a duplicate.
 * Returns null when the pool is genuinely exhausted for this viewer --
 * the client falls back to the most-liked-so-far ranking at that point.
 */
export async function refillMovieNightCandidate(
  movieNightId: string,
  excludeTitleIds: string[]
): Promise<MovieNightCandidate | null> {
  const { user } = await requireUser();
  const candidates = await getCandidatesForMovieNight(movieNightId, {
    viewerId: user.id,
    excludeTitleIds,
    limit: 1,
  });
  return candidates[0] ?? null;
}

async function getActiveParticipantIdsAndVotes(
  movieNightId: string
): Promise<{ participantIds: string[]; votes: MovieNightVoteRecord[] }> {
  const { supabase } = await requireUser();
  const [{ data: participantRows }, { data: voteRows }] = await Promise.all([
    supabase.from("movie_night_participants").select("user_id").eq("movie_night_id", movieNightId),
    supabase.from("movie_night_votes").select("user_id, title_id, vote").eq("movie_night_id", movieNightId),
  ]);
  return {
    participantIds: (participantRows ?? []).map((p) => p.user_id),
    votes: (voteRows ?? []) as MovieNightVoteRecord[],
  };
}

/**
 * Atomically flips a movie night to decided and notifies participants,
 * guarded on status='collecting' so concurrent callers can't double-fire.
 * Two votes completing different matches at nearly the same instant, or a
 * vote-triggered auto-decide racing someone's fallback "Lock this in" tap,
 * both resolve to exactly one winner -- everyone else's attempt just
 * matches zero rows and returns false, no error.
 */
async function finalizeDecision(
  supabase: Awaited<ReturnType<typeof createClient>>,
  movieNightId: string,
  titleId: string,
  actorId: string
): Promise<boolean> {
  const { data: updated, error } = await supabase
    .from("movie_nights")
    .update({ status: "decided", decided_title_id: titleId })
    .eq("id", movieNightId)
    .eq("status", "collecting")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!updated) {
    // Zero rows matched -- either someone else already decided this same
    // night a moment ago (expected: the atomic guard working as intended,
    // nothing to report), OR the RLS policy silently blocked this write
    // (movie_nights only allows updates from participants -- migration
    // 0039 -- and Postgres RLS makes a blocked UPDATE look identical to a
    // lost race: zero rows, no error). Only the second case is a real bug,
    // so check which one actually happened before staying quiet about it.
    const { data: current } = await supabase.from("movie_nights").select("status").eq("id", movieNightId).maybeSingle();
    if (current?.status === "collecting") {
      await captureServerError(
        new Error("finalizeDecision: update matched zero rows while night is still 'collecting' -- likely blocked by RLS (missing/misapplied migration 0039), not a legitimate race"),
        { movieNightId, titleId, actorId }
      );
    }
    return false;
  }

  const { data: participants } = await supabase
    .from("movie_night_participants")
    .select("user_id")
    .eq("movie_night_id", movieNightId);
  for (const p of participants ?? []) {
    await notify(supabase, {
      recipientId: p.user_id,
      actorId,
      type: "movie_night_decided",
      titleId,
      refId: movieNightId,
    });
  }
  return true;
}

/**
 * Titles every current participant has liked (and nobody's passed on) --
 * see computeMatches for the exact rule. Surfaced as its own panel above
 * the candidate grid rather than left buried in per-card vote tallies, so
 * "you two agree" is an actual moment instead of something you have to
 * notice yourself.
 */
export async function getMovieNightMatches(movieNightId: string): Promise<MovieNightMatchResult[]> {
  const { supabase } = await requireUser();
  const { participantIds, votes } = await getActiveParticipantIdsAndVotes(movieNightId);
  const matches = computeMatches(participantIds, votes);
  if (matches.length === 0) return [];

  const { data: titles } = await supabase
    .from("titles")
    .select("*")
    .in("id", matches.map((m) => m.titleId));
  const byId = new Map((titles ?? []).map((t) => [t.id, t]));

  return matches
    .map((m) => ({ title: byId.get(m.titleId), likedBy: m.likedBy }))
    .filter((m): m is MovieNightMatchResult => !!m.title);
}

/**
 * Fallback for when a viewer's queue runs dry with no unanimous match --
 * ranks whatever's been voted on by like count (most agreement first),
 * still excluding anything anyone passed on. Capped at 10 so the host
 * isn't handed the entire vote history to sort through by eye.
 */
export async function getMovieNightFallbackRanking(movieNightId: string): Promise<MovieNightFallbackResult[]> {
  const { supabase } = await requireUser();
  const { votes } = await getActiveParticipantIdsAndVotes(movieNightId);
  const ranked = rankByLikeCount(votes).slice(0, 10);
  if (ranked.length === 0) return [];

  const { data: titles } = await supabase
    .from("titles")
    .select("*")
    .in("id", ranked.map((r) => r.titleId));
  const byId = new Map((titles ?? []).map((t) => [t.id, t]));

  return ranked
    .map((r) => ({ title: byId.get(r.titleId), likeCount: r.likeCount }))
    .filter((r): r is MovieNightFallbackResult => !!r.title);
}

export async function getMovieNightParticipants(movieNightId: string): Promise<MovieNightParticipantRow[]> {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("movie_night_participants")
    .select("user_id, mood, excluded_genres, profiles(username, display_name, avatar_url)")
    .eq("movie_night_id", movieNightId);
  return (data ?? []) as unknown as MovieNightParticipantRow[];
}

const voteSchema = z.object({
  movieNightId: z.string().uuid(),
  titleId: z.string().uuid(),
  vote: z.enum(["like", "pass"]),
});

// No revalidatePath here on purpose: every participant's screen picks up
// votes live via the LiveCandidateVoting component's Supabase Realtime
// subscription (see src/components/movie-night/live-candidate-voting.tsx),
// not a server re-render. Revalidating here would just force an
// unnecessary full page refetch on top of the realtime update.
// Returns whether THIS call is the one that just decided the night --
// letting the voter who completes a match find out synchronously, in the
// same request, instead of solely depending on the movie_nights realtime
// subscription to notify them. That subscription is still what notifies
// every OTHER participant (and remains the fast path for everyone when it
// works), but real usage has shown a match completing with nobody's
// screen changing at all -- if Realtime isn't reaching the client for
// whatever reason, the one piece of information the voter's own client
// can always get for certain is the direct response to their own request.
export async function castMovieNightVote(
  input: z.infer<typeof voteSchema>
): Promise<{ decided: boolean }> {
  const { movieNightId, titleId, vote } = voteSchema.parse(input);
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("movie_night_votes")
    .upsert({ movie_night_id: movieNightId, title_id: titleId, user_id: user.id, vote });
  if (error) throw new Error(error.message);

  // Movie Night has no separate manual lock-in step for the matches case
  // anymore: the moment every current participant has liked the same
  // title with nobody passing on it, that title IS the decision -- no
  // extra tap required from anyone. Only a "like" can ever complete a
  // match (a pass can only ever disqualify one), so skip the check
  // entirely for passes.
  //
  // Wrapped in try/catch and deliberately NOT rethrown: the vote itself
  // (above) already succeeded, so a bug in the auto-decide check shouldn't
  // make the whole action look like it failed to the person voting -- but
  // it should never fail silently either, so it's captured to Sentry.
  if (vote === "like") {
    try {
      const { participantIds, votes } = await getActiveParticipantIdsAndVotes(movieNightId);
      const isMatch = computeMatches(participantIds, votes).some((m) => m.titleId === titleId);
      if (isMatch) {
        const decided = await finalizeDecision(supabase, movieNightId, titleId, user.id);
        return { decided };
      }
    } catch (err) {
      await captureServerError(err, { movieNightId, titleId, stage: "auto-decide" });
    }
  }
  return { decided: false };
}

/**
 * Cheap poll target for a fallback timer in the client (live-candidate-
 * voting.tsx) -- Realtime is the fast path for learning a night's been
 * decided, but shouldn't be the ONLY path: if it's slow, blocked, or just
 * doesn't fire, a participant who didn't cast the deciding vote themselves
 * would otherwise sit on the voting screen indefinitely with a database
 * row that already says "decided". Polled every few seconds rather than
 * subscribed to, deliberately -- one plain select is a much smaller
 * failure surface than the realtime channel it's backstopping.
 */
export async function getMovieNightDecisionStatus(
  movieNightId: string
): Promise<{ status: string; decidedTitleId: string | null }> {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("movie_nights")
    .select("status, decided_title_id")
    .eq("id", movieNightId)
    .maybeSingle();
  return { status: data?.status ?? "collecting", decidedTitleId: data?.decided_title_id ?? null };
}

const decideSchema = z.object({ movieNightId: z.string().uuid(), titleId: z.string().uuid() });

// This now only handles the fallback (no-unanimous-match) case -- the
// matches case auto-decides from castMovieNightVote above. Open to any
// current participant, not just the host: "both should be able to lock
// in the pick" applies here too, since this is the tie-break for when the
// group genuinely can't reach consensus, not an administrative action.
export async function decideMovieNight(
  input: z.infer<typeof decideSchema>
): Promise<{ decided: boolean }> {
  const { movieNightId, titleId } = decideSchema.parse(input);
  const { supabase, user } = await requireUser();

  const { data: participant } = await supabase
    .from("movie_night_participants")
    .select("user_id")
    .eq("movie_night_id", movieNightId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!participant) throw new Error("Only people in this movie night can decide");

  // decided reflects whether THIS call was the one that actually flipped
  // the night -- false means someone else's decide (a match auto-deciding,
  // or another participant's own fallback lock-in) already won the same
  // atomic race a moment earlier, and titleId here is whatever THIS click
  // was aimed at, not necessarily whatever actually got decided.
  const decided = await finalizeDecision(supabase, movieNightId, titleId, user.id);

  // Deliberately NO revalidatePath here -- calling it from a Server Action
  // invoked by the live client (live-candidate-voting.tsx's lockIn) forces
  // an immediate Server Component re-render, which flips night.status and
  // unmounts LiveCandidateVoting (and the DecisionReveal overlay it owns)
  // before the golden reveal ever gets to play. The movie_nights realtime
  // subscription is what's supposed to drive this transition instead, for
  // every viewer including the host -- see the postgres_changes handler in
  // live-candidate-voting.tsx. The route itself is fully dynamic (reads
  // cookies via createClient()), so a fresh visit later still sees current
  // data with no caching to invalidate.
  return { decided };
}

export async function reopenMovieNight(movieNightId: string) {
  const { supabase, user } = await requireUser();
  const { data: night } = await supabase
    .from("movie_nights")
    .select("host_id")
    .eq("id", movieNightId)
    .maybeSingle();
  if (!night) throw new Error("Movie night not found");
  if (night.host_id !== user.id) throw new Error("Only the host can reopen");

  const { error } = await supabase
    .from("movie_nights")
    .update({ status: "collecting", decided_title_id: null })
    .eq("id", movieNightId);
  if (error) throw new Error(error.message);

  revalidatePath(`/movie-night/${movieNightId}`);
}

export async function cancelMovieNight(movieNightId: string) {
  const { supabase, user } = await requireUser();
  const { data: night } = await supabase
    .from("movie_nights")
    .select("host_id")
    .eq("id", movieNightId)
    .maybeSingle();
  if (!night) throw new Error("Movie night not found");
  if (night.host_id !== user.id) throw new Error("Only the host can cancel");

  const { error } = await supabase.from("movie_nights").update({ status: "cancelled" }).eq("id", movieNightId);
  if (error) throw new Error(error.message);

  redirect("/movie-night");
}
