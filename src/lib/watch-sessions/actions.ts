"use server";

import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { captureServerError } from "@/lib/monitoring/sentry-server";
import { computeElapsedSeconds } from "@/lib/watch-sessions/progress";
import type { Database } from "@/lib/supabase/types";
import type { MediaType } from "@/lib/context/media-type-cookie";

export type WatchSessionRow = Database["public"]["Tables"]["watch_sessions"]["Row"];

async function requireUser() {
  const supabase = await createClient();
  // Same "trust middleware, don't re-hit Auth" reasoning as every other
  // mutating action in this app (see lib/actions/social.ts's requireUser).
  const user = await getVerifiedUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

const startSchema = z.object({ titleId: z.string().uuid(), movieNightId: z.string().uuid().nullish() });

/**
 * "Press Play." Resumes an existing paused session for this exact
 * (title, movie night) pair rather than creating a duplicate row on a
 * second tap -- a session already mid-watch (e.g. from re-opening the
 * movie page) should pick back up where it left off, not restart the
 * clock at zero. movieNightId is null for a solo session and set for a
 * Movie Night "watch together" one; the two never collide because the
 * lookup filters on both.
 */
export async function startWatchSession(input: z.infer<typeof startSchema>): Promise<WatchSessionRow> {
  const { titleId, movieNightId } = startSchema.parse(input);
  const { supabase, user } = await requireUser();

  const nightIdFilter = movieNightId ?? null;
  // .is() and .eq() are two different query builder calls, so the
  // movie_night_id filter has to branch rather than trying to pass a
  // possibly-null value into a single .eq().
  let lookup = supabase.from("watch_sessions").select("*").eq("user_id", user.id).eq("title_id", titleId);
  lookup = nightIdFilter === null ? lookup.is("movie_night_id", null) : lookup.eq("movie_night_id", nightIdFilter);
  const { data: existingRow } = await lookup.in("status", ["playing", "paused"]).maybeSingle();

  if (existingRow) {
    if (existingRow.status === "playing") return existingRow;
    const { data: resumed, error } = await supabase
      .from("watch_sessions")
      .update({ status: "playing", started_at: new Date().toISOString(), paused_at: null })
      .eq("id", existingRow.id)
      .select("*")
      .single();
    if (error || !resumed) {
      captureServerError(error ?? new Error("resume watch session returned no row"), { titleId, movieNightId });
      throw new Error("Could not resume watch session");
    }
    revalidatePath(`/movie/${titleId}`);
    if (movieNightId) revalidatePath(`/movie-night/${movieNightId}`);
    return resumed;
  }

  const { data: title } = await supabase.from("titles").select("runtime_minutes").eq("id", titleId).maybeSingle();

  const { data: created, error } = await supabase
    .from("watch_sessions")
    .insert({
      user_id: user.id,
      title_id: titleId,
      movie_night_id: movieNightId ?? null,
      runtime_minutes: title?.runtime_minutes ?? null,
    })
    .select("*")
    .single();

  if (error || !created) {
    captureServerError(error ?? new Error("start watch session returned no row"), { titleId, movieNightId });
    throw new Error("Could not start watch session");
  }

  revalidatePath(`/movie/${titleId}`);
  if (movieNightId) revalidatePath(`/movie-night/${movieNightId}`);
  return created;
}

async function loadOwnSession(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, sessionId: string) {
  const { data } = await supabase.from("watch_sessions").select("*").eq("id", sessionId).eq("user_id", userId).maybeSingle();
  return data;
}

const sessionIdSchema = z.object({ sessionId: z.string().uuid() });

/** Folds the current playing segment into accumulated_seconds and stops
 *  the clock -- pausing never loses time, it just banks whatever the pure
 *  computeElapsedSeconds math says has elapsed so far. */
export async function pauseWatchSession(input: z.infer<typeof sessionIdSchema>): Promise<WatchSessionRow> {
  const { sessionId } = sessionIdSchema.parse(input);
  const { supabase, user } = await requireUser();
  const session = await loadOwnSession(supabase, user.id, sessionId);
  if (!session) throw new Error("Watch session not found");
  if (session.status !== "playing") return session;

  const elapsed = computeElapsedSeconds(
    { status: session.status, accumulatedSeconds: session.accumulated_seconds, startedAt: session.started_at },
    Date.now()
  );

  const { data: updated, error } = await supabase
    .from("watch_sessions")
    .update({ status: "paused", accumulated_seconds: elapsed, paused_at: new Date().toISOString() })
    .eq("id", sessionId)
    .select("*")
    .single();

  if (error || !updated) {
    captureServerError(error ?? new Error("pause watch session returned no row"), { sessionId });
    throw new Error("Could not pause watch session");
  }
  revalidatePath(`/movie/${session.title_id}`);
  if (session.movie_night_id) revalidatePath(`/movie-night/${session.movie_night_id}`);
  return updated;
}

/** Starts a fresh playing segment from wherever accumulated_seconds left
 *  off -- the mirror image of pause. */
export async function resumeWatchSession(input: z.infer<typeof sessionIdSchema>): Promise<WatchSessionRow> {
  const { sessionId } = sessionIdSchema.parse(input);
  const { supabase, user } = await requireUser();
  const session = await loadOwnSession(supabase, user.id, sessionId);
  if (!session) throw new Error("Watch session not found");
  if (session.status !== "paused") return session;

  const { data: updated, error } = await supabase
    .from("watch_sessions")
    .update({ status: "playing", started_at: new Date().toISOString(), paused_at: null })
    .eq("id", sessionId)
    .select("*")
    .single();

  if (error || !updated) {
    captureServerError(error ?? new Error("resume watch session returned no row"), { sessionId });
    throw new Error("Could not resume watch session");
  }
  revalidatePath(`/movie/${session.title_id}`);
  if (session.movie_night_id) revalidatePath(`/movie-night/${session.movie_night_id}`);
  return updated;
}

/**
 * "Mark as finished" -- either the self-reported clock reaching the
 * title's own runtime, or the person tapping it manually early. Folds any
 * still-playing segment into accumulated_seconds first so the final
 * elapsed number is honest, then logs it to watch_history the same way
 * every other "I watched this" signal in the app already does (see
 * implicit-affinity.ts's watch_history read), so this feeds the taste
 * graph like a normal watch, not a special case.
 */
export async function completeWatchSession(input: z.infer<typeof sessionIdSchema>): Promise<WatchSessionRow> {
  const { sessionId } = sessionIdSchema.parse(input);
  const { supabase, user } = await requireUser();
  const session = await loadOwnSession(supabase, user.id, sessionId);
  if (!session) throw new Error("Watch session not found");
  if (session.status === "completed") return session;

  const elapsed = computeElapsedSeconds(
    { status: session.status, accumulatedSeconds: session.accumulated_seconds, startedAt: session.started_at },
    Date.now()
  );

  const { data: updated, error } = await supabase
    .from("watch_sessions")
    .update({ status: "completed", accumulated_seconds: elapsed, completed_at: new Date().toISOString() })
    .eq("id", sessionId)
    .select("*")
    .single();

  if (error || !updated) {
    captureServerError(error ?? new Error("complete watch session returned no row"), { sessionId });
    throw new Error("Could not complete watch session");
  }

  // Best-effort -- a failed watch_history insert should never make the
  // "finish watching" action itself appear to fail to the person tapping
  // it, same swallow-and-report pattern used elsewhere for non-critical
  // side writes.
  try {
    await supabase.from("watch_history").insert({ user_id: user.id, title_id: session.title_id, source: "watch_session" });
  } catch (e) {
    captureServerError(e, { sessionId, context: "watch_history insert after completeWatchSession" });
  }

  revalidatePath(`/movie/${session.title_id}`);
  if (session.movie_night_id) revalidatePath(`/movie-night/${session.movie_night_id}`);
  return updated;
}

/** Stops tracking without counting it as watched -- e.g. someone pressed
 *  Play by mistake, or switched to something else. Distinct from
 *  completed so it never writes a false watch_history row. Persists the
 *  final elapsed time and an abandoned_at timestamp (mirroring
 *  completeWatchSession's own accounting) so a later abandon can answer
 *  "did they bail in the first five minutes or three-quarters of the way
 *  through" -- the one fact that determines whether this is even a
 *  meaningful taste signal (see similarity_to_disliked_titles's abandoned
 *  arm, migration 0091). */
export async function abandonWatchSession(input: z.infer<typeof sessionIdSchema>): Promise<WatchSessionRow> {
  const { sessionId } = sessionIdSchema.parse(input);
  const { supabase, user } = await requireUser();
  const session = await loadOwnSession(supabase, user.id, sessionId);
  if (!session) throw new Error("Watch session not found");
  if (session.status === "abandoned") return session;

  const elapsed = computeElapsedSeconds(
    { status: session.status, accumulatedSeconds: session.accumulated_seconds, startedAt: session.started_at },
    Date.now()
  );

  const { data: updated, error } = await supabase
    .from("watch_sessions")
    .update({ status: "abandoned", accumulated_seconds: elapsed, abandoned_at: new Date().toISOString() })
    .eq("id", sessionId)
    .select("*")
    .single();

  if (error || !updated) {
    captureServerError(error ?? new Error("abandon watch session returned no row"), { sessionId });
    throw new Error("Could not stop watch session");
  }
  revalidatePath(`/movie/${session.title_id}`);
  if (session.movie_night_id) revalidatePath(`/movie-night/${session.movie_night_id}`);
  return updated;
}

/** Solo Continue Watching lookup: does the viewer already have an
 *  in-progress (playing or paused) session for this title, outside any
 *  Movie Night context. Powers the movie page's Press Play button
 *  rendering as "Continue" instead of "Play" on repeat visits. */
export async function getActiveWatchSession(titleId: string): Promise<WatchSessionRow | null> {
  const supabase = await createClient();
  const user = await getVerifiedUser();
  if (!user) return null;

  const { data } = await supabase
    .from("watch_sessions")
    .select("*")
    .eq("user_id", user.id)
    .eq("title_id", titleId)
    .is("movie_night_id", null)
    .in("status", ["playing", "paused"])
    .maybeSingle();

  return data ?? null;
}

export interface MovieNightWatchSessionRow extends WatchSessionRow {
  profiles: { username: string | null; display_name: string | null; avatar_url: string | null } | null;
}

/**
 * Everyone's live "watching now" state for a Movie Night's decided pick --
 * the group counterpart to getActiveWatchSession. RLS (see migration
 * 0089) already scopes this to "you can only read sessions for a night
 * you're actually a participant in," so this is a plain select, not a
 * privileged query.
 */
export async function getMovieNightWatchSessions(movieNightId: string): Promise<MovieNightWatchSessionRow[]> {
  const supabase = await createClient();
  const user = await getVerifiedUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("watch_sessions")
    .select("*, profiles(username, display_name, avatar_url)")
    .eq("movie_night_id", movieNightId)
    .in("status", ["playing", "paused", "completed"])
    .order("started_at", { ascending: true });

  if (error) {
    captureServerError(error, { movieNightId, context: "getMovieNightWatchSessions" });
    return [];
  }

  return (data ?? []) as unknown as MovieNightWatchSessionRow[];
}

export interface ContinueWatchingItem {
  session: WatchSessionRow;
  title: Pick<Database["public"]["Tables"]["titles"]["Row"], "id" | "name" | "poster_url" | "runtime_minutes">;
}

/**
 * Home page "Continue watching" (rendition D) -- the viewer's own most
 * recently active solo session (movie_night_id null, so a Watch
 * Together session never doubles up here and on the group panel),
 * scoped to whichever media type is currently active so switching to
 * Shows doesn't surface a paused movie. Ordered by started_at desc: for
 * a "playing" row that's when the current segment began, for "paused"
 * it's the segment that was running right before the last pause -- in
 * both cases the most recently touched session, which is what "pick up
 * where you left off" actually means here, not whichever session
 * happens to have the lowest id.
 */
export async function getContinueWatching(mediaType: MediaType): Promise<ContinueWatchingItem | null> {
  const supabase = await createClient();
  const user = await getVerifiedUser();
  if (!user) return null;

  // Filtering on an embedded relationship's column (titles.type) via the
  // query builder trips up the generated Database types here (the
  // watch_sessions <-> titles relationship isn't declared richly enough
  // for TS to prove the embed is valid), so this fetches a small recent
  // batch of the viewer's own sessions first and resolves/filters the
  // title side as a second, plainly-typed query instead of fighting the
  // generator over one clever one. A handful of rows, not a real N+1 --
  // Continue Watching only ever needs the single most recent match.
  const { data: sessions, error: sessionsError } = await supabase
    .from("watch_sessions")
    .select("*")
    .eq("user_id", user.id)
    .is("movie_night_id", null)
    .in("status", ["playing", "paused"])
    .order("started_at", { ascending: false })
    .limit(5);

  if (sessionsError) {
    captureServerError(sessionsError, { context: "getContinueWatching" });
    return null;
  }
  if (!sessions || sessions.length === 0) return null;

  const { data: titles, error: titlesError } = await supabase
    .from("titles")
    .select("id, name, poster_url, runtime_minutes, type")
    .in(
      "id",
      sessions.map((s) => s.title_id)
    );

  if (titlesError) {
    captureServerError(titlesError, { context: "getContinueWatching titles lookup" });
    return null;
  }

  const titleById = new Map((titles ?? []).map((t) => [t.id, t]));
  for (const session of sessions) {
    const title = titleById.get(session.title_id);
    if (title && title.type === mediaType) {
      return { session, title };
    }
  }
  return null;
}
