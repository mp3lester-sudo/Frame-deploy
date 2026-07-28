/**
 * Matchmaking — pure compatibility scoring (no I/O), mirroring the
 * taste-dna/archetypes.ts split: src/lib/matchmaking/compute.ts queries
 * Supabase and calls into here.
 *
 * Blends up to three signals, using whichever are actually available for a
 * given pair of users so this works today (no OpenAI billing needed) and
 * gets more precise once taste_vectors embeddings exist:
 *   1. Embedding similarity (taste_vectors) — the real Taste Graph distance,
 *      once both users have one.
 *   2. Genre sentiment similarity — per-genre average signed rating
 *      (loving vs. hating a genre), compared across genres both users have
 *      rated anything in. Works from day one off plain ratings + TMDB
 *      genres.
 *   3. Common-title agreement — for titles both users actually rated, how
 *      close their scores are. The most literal "do you two agree" signal.
 */

export interface UserTasteSignal {
  /** genre -> { sum of signed weights, count of ratings touching that genre } */
  genreSentiment: Record<string, { sum: number; count: number }>;
  embedding: number[] | null;
  ratingsById: Record<string, number>;
  favoriteGenres: string[];
  favoriteDirectorIds: string[];
}

export interface CompatibilityResult {
  percent: number;
  sharedFavoriteGenres: string[];
  sharedFavoriteDirectorIds: string[];
  biggestDisagreementGenre: string | null;
  commonRatedCount: number;
}

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function genreSentimentCosine(
  a: UserTasteSignal["genreSentiment"],
  b: UserTasteSignal["genreSentiment"]
): number | null {
  const genres = new Set([...Object.keys(a), ...Object.keys(b)]);
  if (genres.size === 0) return null;
  const vecA: number[] = [];
  const vecB: number[] = [];
  for (const g of genres) {
    vecA.push(a[g] ? a[g].sum / a[g].count : 0);
    vecB.push(b[g] ? b[g].sum / b[g].count : 0);
  }
  return cosineSimilarity(vecA, vecB);
}

function commonRatedAgreement(
  a: UserTasteSignal["ratingsById"],
  b: UserTasteSignal["ratingsById"]
): { agreement: number; count: number } {
  const commonIds = Object.keys(a).filter((id) => id in b);
  if (commonIds.length === 0) return { agreement: 0, count: 0 };
  const totalDiff = commonIds.reduce((sum, id) => sum + Math.abs(a[id] - b[id]), 0);
  const avgDiff = totalDiff / commonIds.length;
  // Ratings are 0.5-5, so max possible diff is 4.5.
  const agreement = 1 - avgDiff / 4.5;
  return { agreement, count: commonIds.length };
}

function findBiggestDisagreement(
  a: UserTasteSignal["genreSentiment"],
  b: UserTasteSignal["genreSentiment"]
): string | null {
  let worstGenre: string | null = null;
  let worstDiff = 0;
  for (const genre of Object.keys(a)) {
    if (!(genre in b)) continue;
    const avgA = a[genre].sum / a[genre].count;
    const avgB = b[genre].sum / b[genre].count;
    const diff = Math.abs(avgA - avgB);
    if (diff > worstDiff) {
      worstDiff = diff;
      worstGenre = genre;
    }
  }
  return worstDiff > 0.3 ? worstGenre : null;
}

export function computeCompatibility(a: UserTasteSignal, b: UserTasteSignal): CompatibilityResult {
  const signals: { value: number; weight: number }[] = [];

  if (a.embedding && b.embedding) {
    const embeddingSim = cosineSimilarity(a.embedding, b.embedding);
    signals.push({ value: (embeddingSim + 1) / 2, weight: 3 });
  }

  const genreSim = genreSentimentCosine(a.genreSentiment, b.genreSentiment);
  if (genreSim !== null) {
    signals.push({ value: (genreSim + 1) / 2, weight: 2 });
  }

  const { agreement, count: commonRatedCount } = commonRatedAgreement(a.ratingsById, b.ratingsById);
  if (commonRatedCount >= 2) {
    signals.push({ value: Math.max(0, Math.min(1, agreement)), weight: 1 });
  }

  const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
  const blended = totalWeight > 0 ? signals.reduce((sum, s) => sum + s.value * s.weight, 0) / totalWeight : 0.5;

  const sharedFavoriteGenres = a.favoriteGenres.filter((g) => b.favoriteGenres.includes(g));
  const sharedFavoriteDirectorIds = a.favoriteDirectorIds.filter((id) => b.favoriteDirectorIds.includes(id));

  return {
    percent: Math.round(blended * 100),
    sharedFavoriteGenres,
    sharedFavoriteDirectorIds,
    biggestDisagreementGenre: findBiggestDisagreement(a.genreSentiment, b.genreSentiment),
    commonRatedCount,
  };
}
