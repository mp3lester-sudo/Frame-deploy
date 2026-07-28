/**
 * Taste DNA — pure scoring logic (no I/O, no Supabase) so it's cheap to unit
 * test. src/lib/taste-dna/compute.ts does the querying and calls into here.
 *
 * The pitch: nobody wants recommendations "because you liked The Dark
 * Knight" — they want to know they love morally gray protagonists and
 * atmospheric tension. Archetypes below are a transparent, rule-based first
 * cut at that: each is a genre + keyword profile scored against a user's
 * positively-rated titles. Genre data exists today; keyword data (tone,
 * themes, mood_tags) only exists once a title has been AI-enriched, so each
 * archetype blends the two dimensions and re-weights automatically toward
 * whichever one actually has data — a user's DNA gets sharper on its own as
 * more of the catalogue gets enriched, with no code change required.
 */

export interface RatedTitleFeatures {
  /** Positive-only affinity weight, e.g. max(score - 2.5, 0). Titles you
   * disliked don't count toward a "taste for" anything. */
  weight: number;
  genres: string[];
  tone: string[];
  themes: string[];
  moodTags: string[];
  decade: string | null;
  originalLanguage: string | null;
  directorId: string | null;
  directorName: string | null;
  pacing: string | null;
  violenceLevel: number | null;
  comedyLevel: number | null;
  emotionalIntensity: number | null;
}

interface ArchetypeDef {
  name: string;
  genres: string[];
  keywords: string[];
  /** Optional extra match condition (e.g. "not in English") that counts
   * alongside genre membership for this archetype only. */
  extraMatch?: (f: RatedTitleFeatures) => boolean;
}

const ARCHETYPES: ArchetypeDef[] = [
  {
    name: "Psychological Slow Burn",
    genres: ["Thriller", "Drama", "Mystery"],
    keywords: ["psycholog", "paranoi", "obsess", "tension", "slow burn", "unreliable", "identity", "dread", "unravel"],
  },
  {
    name: "Neo-Noir",
    genres: ["Crime", "Thriller", "Mystery"],
    keywords: ["noir", "morally gray", "corrupt", "cynical", "femme fatale", "hardboiled", "shadow", "detective"],
  },
  {
    name: "Emotional Character Study",
    genres: ["Drama"],
    keywords: ["grief", "intimate", "relationship", "identity", "healing", "melanchol", "bittersweet", "coming of age"],
  },
  {
    name: "Experimental Cinema",
    genres: [],
    keywords: ["surreal", "abstract", "dreamlike", "nonlinear", "existential", "avant-garde", "fragmented", "hallucinat"],
  },
  {
    name: "Blockbuster Spectacle",
    genres: ["Action", "Adventure", "Science Fiction", "Fantasy"],
    keywords: ["epic", "spectacle", "thrilling", "large-scale", "adrenaline", "large scale"],
  },
  {
    name: "Prestige Drama",
    genres: ["Drama", "History", "War"],
    keywords: ["somber", "restrained", "legacy", "ambition", "period piece", "biograph"],
  },
  {
    name: "Feel-Good Comfort",
    genres: ["Comedy", "Romance", "Family"],
    keywords: ["warm", "feel-good", "heartwarming", "light-hearted", "whimsical", "charming", "cozy"],
  },
  {
    name: "Horror & Dread",
    genres: ["Horror"],
    keywords: ["dread", "unsettling", "visceral", "terrifying", "gore", "supernatural", "creeping"],
  },
  {
    name: "Witty Comedy",
    genres: ["Comedy"],
    keywords: ["witty", "satirical", "absurd", "deadpan", "irreverent", "sharp dialogue"],
  },
  {
    name: "World Cinema Explorer",
    genres: [],
    keywords: ["contemplative", "meditative", "poetic", "understated"],
    extraMatch: (f) => !!f.originalLanguage && f.originalLanguage !== "en",
  },
];

export interface TasteDnaResult {
  sampleSize: number;
  enrichedSampleSize: number;
  archetypes: { name: string; percent: number }[];
  favoriteGenres: string[];
  favoriteDecades: string[];
  favoriteDirectors: { id: string; name: string }[];
  pacingPreference: string | null;
  violenceTolerance: number | null;
  comedyTolerance: number | null;
  emotionalIntensityPreference: number | null;
}

function textMatchesKeywords(haystack: string[], keywords: string[]): boolean {
  if (!keywords.length || !haystack.length) return false;
  const joined = haystack.join(" ").toLowerCase();
  return keywords.some((kw) => joined.includes(kw));
}

function topEntries(map: Map<string, number>, n: number): string[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key]) => key);
}

function weightedAverage(values: { value: number; weight: number }[]): number | null {
  const totalWeight = values.reduce((sum, v) => sum + v.weight, 0);
  if (totalWeight === 0) return null;
  return values.reduce((sum, v) => sum + v.value * v.weight, 0) / totalWeight;
}

export function computeTasteDnaFromRatings(rated: RatedTitleFeatures[]): TasteDnaResult {
  const positivelyRated = rated.filter((r) => r.weight > 0);

  const totalWeight = positivelyRated.reduce((sum, r) => sum + r.weight, 0);
  const enriched = positivelyRated.filter((r) => r.tone.length || r.themes.length || r.moodTags.length);
  const totalTaggedWeight = enriched.reduce((sum, r) => sum + r.weight, 0);

  const genreScore = new Map<string, number>();
  const decadeScore = new Map<string, number>();
  const directorScore = new Map<string, { name: string; score: number }>();

  for (const r of positivelyRated) {
    for (const g of r.genres) genreScore.set(g, (genreScore.get(g) ?? 0) + r.weight);
    if (r.decade) decadeScore.set(r.decade, (decadeScore.get(r.decade) ?? 0) + r.weight);
    if (r.directorId && r.directorName) {
      const existing = directorScore.get(r.directorId);
      directorScore.set(r.directorId, { name: r.directorName, score: (existing?.score ?? 0) + r.weight });
    }
  }

  const archetypes = ARCHETYPES.map((archetype) => {
    let genreHitWeight = 0;
    for (const r of positivelyRated) {
      const genreHit = archetype.genres.length > 0 && r.genres.some((g) => archetype.genres.includes(g));
      const extraHit = archetype.extraMatch?.(r) ?? false;
      if (genreHit || extraHit) genreHitWeight += r.weight;
    }
    const genreShare = totalWeight > 0 ? genreHitWeight / totalWeight : 0;

    let tagHitWeight = 0;
    for (const r of enriched) {
      const haystack = [...r.tone, ...r.themes, ...r.moodTags];
      if (textMatchesKeywords(haystack, archetype.keywords)) tagHitWeight += r.weight;
    }
    const tagShare = totalTaggedWeight > 0 ? tagHitWeight / totalTaggedWeight : 0;

    const blended = totalTaggedWeight > 0 ? 0.55 * genreShare + 0.45 * tagShare : genreShare;
    return { name: archetype.name, percent: Math.round(Math.min(blended, 1) * 100) };
  }).sort((a, b) => b.percent - a.percent);

  const pacingCounts = new Map<string, number>();
  for (const r of positivelyRated) {
    if (r.pacing) pacingCounts.set(r.pacing, (pacingCounts.get(r.pacing) ?? 0) + r.weight);
  }
  const pacingPreference = topEntries(pacingCounts, 1)[0] ?? null;

  const violenceTolerance = weightedAverage(
    positivelyRated.filter((r) => r.violenceLevel != null).map((r) => ({ value: r.violenceLevel!, weight: r.weight }))
  );
  const comedyTolerance = weightedAverage(
    positivelyRated.filter((r) => r.comedyLevel != null).map((r) => ({ value: r.comedyLevel!, weight: r.weight }))
  );
  const emotionalIntensityPreference = weightedAverage(
    positivelyRated
      .filter((r) => r.emotionalIntensity != null)
      .map((r) => ({ value: r.emotionalIntensity!, weight: r.weight }))
  );

  return {
    sampleSize: positivelyRated.length,
    enrichedSampleSize: enriched.length,
    archetypes,
    favoriteGenres: topEntries(genreScore, 5),
    favoriteDecades: topEntries(decadeScore, 3),
    favoriteDirectors: [...directorScore.entries()]
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 5)
      .map(([id, { name }]) => ({ id, name })),
    pacingPreference,
    violenceTolerance: violenceTolerance != null ? Math.round(violenceTolerance) : null,
    comedyTolerance: comedyTolerance != null ? Math.round(comedyTolerance) : null,
    emotionalIntensityPreference:
      emotionalIntensityPreference != null ? Math.round(emotionalIntensityPreference) : null,
  };
}
