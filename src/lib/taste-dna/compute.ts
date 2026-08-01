import { createClient } from "@/lib/supabase/server";
import { computeTasteDnaFromRatings, type TasteDnaResult } from "@/lib/taste-dna/archetypes";
import { computeTasteEvolution, type RatedTitleFeaturesWithTime, type TasteEvolutionResult } from "@/lib/taste-dna/evolution";
import {
  computeWrapped as computeWrappedFromRatings,
  getMonthRange,
  type WrappedRatedTitle,
  type WrappedResult,
} from "@/lib/taste-dna/wrapped";

function toDecade(releaseDate: string | null): string | null {
  if (!releaseDate) return null;
  const year = Number(releaseDate.slice(0, 4));
  if (!Number.isFinite(year)) return null;
  return `${Math.floor(year / 10) * 10}s`;
}

export interface TasteDnaWithEvolution extends TasteDnaResult {
  /** null when there isn't enough rating history yet to say anything
   *  meaningful about change over time (see evolution.ts's thresholds). */
  evolution: TasteEvolutionResult | null;
}

/**
 * Computes a user's Taste DNA from their ratings + the titles/credits those
 * ratings point to, then persists the flat, column-shaped fields (favorite
 * genres/decades/directors, pacing/violence/comedy/emotional-intensity) into
 * the existing taste_attributes table — it's had columns for exactly this
 * since the original schema, just never populated. The richer named
 * archetype percentages (Neo-Noir, Psychological Slow Burn, etc.) don't fit
 * fixed columns, so those are returned for display but recomputed on each
 * call rather than persisted — cheap given realistic per-user rating counts.
 *
 * Also computes taste evolution (see evolution.ts) from the same rating
 * history, split chronologically — no separate query, no snapshot table.
 */
export async function computeTasteDna(userId: string): Promise<TasteDnaWithEvolution> {
  const supabase = await createClient();

  const { data: ratings } = await supabase
    .from("ratings")
    .select("title_id, score, created_at")
    .eq("user_id", userId);

  if (!ratings?.length) {
    return { ...computeTasteDnaFromRatings([]), evolution: null };
  }

  const titleIds = ratings.map((r) => r.title_id);

  const [{ data: titles }, { data: directorCredits }] = await Promise.all([
    supabase
      .from("titles")
      .select(
        "id, genres, tone, themes, mood_tags, pacing, violence_level, comedy_level, emotional_intensity, release_date, original_language"
      )
      .in("id", titleIds),
    supabase
      .from("title_credits")
      .select("title_id, people(id, name)")
      .eq("credit_type", "director")
      .in("title_id", titleIds),
  ]);

  const titleById = new Map((titles ?? []).map((t) => [t.id, t]));
  const directorByTitle = new Map<string, { id: string; name: string }>();
  for (const c of directorCredits ?? []) {
    const person = (c as unknown as { people: { id: string; name: string } | null }).people;
    if (person) directorByTitle.set(c.title_id, { id: person.id, name: person.name });
  }

  const rated: RatedTitleFeaturesWithTime[] = ratings
    .map((r) => {
      const title = titleById.get(r.title_id);
      if (!title) return null;
      const director = directorByTitle.get(r.title_id);
      const feature: RatedTitleFeaturesWithTime = {
        weight: Math.max(r.score - 2.5, 0),
        genres: title.genres ?? [],
        tone: title.tone ?? [],
        themes: title.themes ?? [],
        moodTags: title.mood_tags ?? [],
        decade: toDecade(title.release_date),
        originalLanguage: title.original_language,
        directorId: director?.id ?? null,
        directorName: director?.name ?? null,
        pacing: title.pacing,
        violenceLevel: title.violence_level,
        comedyLevel: title.comedy_level,
        emotionalIntensity: title.emotional_intensity,
        ratedAt: r.created_at,
      };
      return feature;
    })
    .filter((f): f is RatedTitleFeaturesWithTime => f !== null);

  const result = computeTasteDnaFromRatings(rated);
  const evolution = computeTasteEvolution(rated);

  // Best-effort persistence — a failed write here shouldn't break the page.
  try {
    await supabase.from("taste_attributes").upsert({
      user_id: userId,
      pacing_preference: result.pacingPreference,
      violence_tolerance: result.violenceTolerance,
      comedy_tolerance: result.comedyTolerance,
      emotional_intensity_preference: result.emotionalIntensityPreference,
      favorite_genres: result.favoriteGenres,
      favorite_decades: result.favoriteDecades,
      favorite_directors: result.favoriteDirectors.map((d) => d.id),
    });
  } catch {
    // non-fatal
  }

  return { ...result, evolution };
}

/**
 * "Wrapped" for a given calendar year — same ratings->titles->credits join
 * shape as computeTasteDna, scoped to one year and pulling a few extra
 * columns (poster/name/runtime/vote count) that the yearly recap needs but
 * the always-on Taste DNA page doesn't. See wrapped.ts for the actual
 * scoring; this is just the DB-fetching wrapper (kept separate so the
 * scoring stays unit-testable without Supabase).
 */
async function fetchRatedTitlesInRange(
  userId: string,
  startIso: string,
  endIso: string
): Promise<WrappedRatedTitle[]> {
  const supabase = await createClient();

  const { data: ratings } = await supabase
    .from("ratings")
    .select("title_id, score, created_at")
    .eq("user_id", userId)
    .gte("created_at", startIso)
    .lt("created_at", endIso);

  if (!ratings?.length) return [];

  const titleIds = ratings.map((r) => r.title_id);

  const [{ data: titles }, { data: directorCredits }] = await Promise.all([
    supabase
      .from("titles")
      .select(
        "id, name, poster_url, genres, tone, themes, mood_tags, pacing, violence_level, comedy_level, emotional_intensity, release_date, original_language, runtime_minutes, tmdb_vote_count"
      )
      .in("id", titleIds),
    supabase
      .from("title_credits")
      .select("title_id, people(id, name)")
      .eq("credit_type", "director")
      .in("title_id", titleIds),
  ]);

  const titleById = new Map((titles ?? []).map((t) => [t.id, t]));
  const directorByTitle = new Map<string, { id: string; name: string }>();
  for (const c of directorCredits ?? []) {
    const person = (c as unknown as { people: { id: string; name: string } | null }).people;
    if (person) directorByTitle.set(c.title_id, { id: person.id, name: person.name });
  }

  return ratings
    .map((r) => {
      const title = titleById.get(r.title_id);
      if (!title) return null;
      const director = directorByTitle.get(r.title_id);
      const feature: WrappedRatedTitle = {
        titleId: title.id,
        titleName: title.name,
        posterUrl: title.poster_url,
        score: r.score,
        weight: Math.max(r.score - 2.5, 0),
        ratedAt: r.created_at,
        runtimeMinutes: title.runtime_minutes,
        tmdbVoteCount: title.tmdb_vote_count,
        genres: title.genres ?? [],
        tone: title.tone ?? [],
        themes: title.themes ?? [],
        moodTags: title.mood_tags ?? [],
        decade: toDecade(title.release_date),
        originalLanguage: title.original_language,
        directorId: director?.id ?? null,
        directorName: director?.name ?? null,
        pacing: title.pacing,
        violenceLevel: title.violence_level,
        comedyLevel: title.comedy_level,
        emotionalIntensity: title.emotional_intensity,
      };
      return feature;
    })
    .filter((f): f is WrappedRatedTitle => f !== null);
}

export async function computeWrapped(userId: string, year: number): Promise<WrappedResult | null> {
  const yearStart = `${year}-01-01T00:00:00.000Z`;
  const yearEnd = `${year + 1}-01-01T00:00:00.000Z`;
  const rated = await fetchRatedTitlesInRange(userId, yearStart, yearEnd);
  if (!rated.length) return null;
  return computeWrappedFromRatings(rated, year);
}

/**
 * Monthly recap -- same scoring as the annual Wrapped, scoped to the
 * current UTC calendar month instead of a full year. A Premium-only perk
 * (task #140): gated in lib/actions/wrapped.ts's getMyMonthlyWrapped, not
 * here, so this function itself stays a plain data query with no plan
 * logic mixed in. Uses `year` as the numeric bookkeeping value WrappedResult
 * already requires (share/OG-image code reads it) but the actual headline
 * text uses the month label instead -- see computeWrapped's summaryLabel
 * param.
 */
export async function computeMonthlyWrapped(userId: string): Promise<WrappedResult | null> {
  const { start, end, label } = getMonthRange(new Date());
  const rated = await fetchRatedTitlesInRange(userId, start, end);
  if (!rated.length) return null;
  return computeWrappedFromRatings(rated, new Date().getUTCFullYear(), label);
}
