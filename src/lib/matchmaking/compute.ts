import { createClient } from "@/lib/supabase/server";
import { computeCompatibility, type UserTasteSignal } from "@/lib/matchmaking/scoring";

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function buildSignal(supabase: Supabase, userId: string): Promise<UserTasteSignal> {
  const [{ data: attrs }, { data: vector }, { data: ratings }] = await Promise.all([
    supabase.from("taste_attributes").select("favorite_genres, favorite_directors").eq("user_id", userId).maybeSingle(),
    supabase.from("taste_vectors").select("embedding").eq("user_id", userId).maybeSingle(),
    supabase.from("ratings").select("title_id, score").eq("user_id", userId),
  ]);

  const ratingsById: Record<string, number> = {};
  for (const r of ratings ?? []) ratingsById[r.title_id] = r.score;

  const titleIds = Object.keys(ratingsById);
  const { data: titles } = titleIds.length
    ? await supabase.from("titles").select("id, genres").in("id", titleIds)
    : { data: [] };
  const genresByTitle = new Map((titles ?? []).map((t) => [t.id, t.genres ?? []]));

  const genreSentiment: UserTasteSignal["genreSentiment"] = {};
  for (const [titleId, score] of Object.entries(ratingsById)) {
    const weight = (score - 2.5) / 2.5;
    for (const g of genresByTitle.get(titleId) ?? []) {
      const entry = genreSentiment[g] ?? { sum: 0, count: 0 };
      entry.sum += weight;
      entry.count += 1;
      genreSentiment[g] = entry;
    }
  }

  return {
    genreSentiment,
    embedding: vector?.embedding ?? null,
    ratingsById,
    favoriteGenres: attrs?.favorite_genres ?? [],
    favoriteDirectorIds: attrs?.favorite_directors ?? [],
  };
}

export interface CompatibilityWithNames {
  percent: number;
  sharedFavoriteGenres: string[];
  sharedFavoriteDirectors: { id: string; name: string }[];
  biggestDisagreementGenre: string | null;
  commonRatedCount: number;
  hasEnoughData: boolean;
}

const MIN_RATINGS_EACH = 3;

/**
 * Compatibility between two users, computed fresh on each profile view.
 * Blends embedding similarity (once taste_vectors exist), genre-sentiment
 * similarity (works today from plain ratings), and common-title agreement —
 * see src/lib/matchmaking/scoring.ts for the actual math.
 */
export async function computeCompatibilityForUsers(
  userAId: string,
  userBId: string
): Promise<CompatibilityWithNames> {
  const supabase = await createClient();
  const [a, b] = await Promise.all([buildSignal(supabase, userAId), buildSignal(supabase, userBId)]);

  const result = computeCompatibility(a, b);

  let sharedFavoriteDirectors: { id: string; name: string }[] = [];
  if (result.sharedFavoriteDirectorIds.length) {
    const { data: people } = await supabase
      .from("people")
      .select("id, name")
      .in("id", result.sharedFavoriteDirectorIds);
    sharedFavoriteDirectors = people ?? [];
  }

  const hasEnoughData =
    Object.keys(a.ratingsById).length >= MIN_RATINGS_EACH && Object.keys(b.ratingsById).length >= MIN_RATINGS_EACH;

  return {
    percent: result.percent,
    sharedFavoriteGenres: result.sharedFavoriteGenres,
    sharedFavoriteDirectors,
    biggestDisagreementGenre: result.biggestDisagreementGenre,
    commonRatedCount: result.commonRatedCount,
    hasEnoughData,
  };
}
