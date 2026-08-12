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
 *
 * Each archetype score also carries its own receipts (citedTitles,
 * matchedKeywords) rather than landing as a bare name + percent — "Neo-Noir
 * 62%" asserted with no evidence reads as a black box; "driven by Chinatown,
 * The Long Goodbye — morally gray, cynical" reads as something the app
 * actually noticed. Titles are attributed by whichever match (genre or
 * keyword) is present; a title can back multiple archetypes at once, same
 * as one movie can genuinely be both Neo-Noir and Prestige Drama.
 */

export interface RatedTitleFeatures {
  /** Positive-only affinity weight, e.g. max(score - 2.5, 0). Titles you
   * disliked don't count toward a "taste for" anything. */
  weight: number;
  /** Optional -- only used to cite specific titles behind an archetype
   * score. Omitted in most existing unit tests, which only assert on
   * percentages; citations simply come back empty in that case. */
  titleId?: string;
  titleName?: string;
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

/** ISO 639-1 codes actually seen in the TMDB catalogue -- falls back to the
 *  raw uppercased code for anything not listed rather than guessing. */
const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  fr: "French",
  ja: "Japanese",
  ko: "Korean",
  es: "Spanish",
  it: "Italian",
  de: "German",
  zh: "Mandarin",
  cn: "Chinese",
  hi: "Hindi",
  pt: "Portuguese",
  ru: "Russian",
  sv: "Swedish",
  da: "Danish",
  no: "Norwegian",
  fi: "Finnish",
  pl: "Polish",
  tr: "Turkish",
  th: "Thai",
  nl: "Dutch",
  ar: "Arabic",
  he: "Hebrew",
  cs: "Czech",
  el: "Greek",
  hu: "Hungarian",
  ro: "Romanian",
};

export function languageLabel(code: string): string {
  return LANGUAGE_LABELS[code] ?? code.toUpperCase();
}

export interface ArchetypeScore {
  name: string;
  percent: number;
  /** Up to 3 rated titles that most drove this score, highest-weight
   *  first. Empty if the input rows didn't include titleId/titleName. */
  citedTitles: { id: string; name: string }[];
  /** Up to 3 tone/theme/mood keywords that actually matched, most
   *  frequent first. Empty when this archetype scored purely on genre
   *  (no enriched rows matched its keyword list). */
  matchedKeywords: string[];
}

export interface TasteDnaResult {
  sampleSize: number;
  enrichedSampleSize: number;
  archetypes: ArchetypeScore[];
  favoriteGenres: string[];
  favoriteDecades: string[];
  favoriteDirectors: { id: string; name: string }[];
  pacingPreference: string | null;
  violenceTolerance: number | null;
  comedyTolerance: number | null;
  emotionalIntensityPreference: number | null;
  /** Top tone/theme/mood tags across all enriched positively-rated titles,
   *  weighted the same way archetypes are -- a finer-grained read than the
   *  10 fixed archetype buckets above. Empty until enough titles are
   *  AI-enriched. */
  moodBreakdown: { tag: string; percent: number }[];
  /** Original-language split across ALL positively-rated titles (not just
   *  the top 3), so "mostly English, with a Korean streak" is visible
   *  rather than collapsed into a single "favorite" language. */
  languageBreakdown: { label: string; percent: number }[];
  /** Full decade distribution (not just the top 3 favoriteDecades),
   *  chronologically sorted, meant for a chart rather than a pill list. */
  eraDistribution: { decade: string; percent: number }[];
}

function matchingKeywords(haystack: string[], keywords: string[]): string[] {
  if (!keywords.length || !haystack.length) return [];
  const joined = haystack.join(" ").toLowerCase();
  return keywords.filter((kw) => joined.includes(kw));
}

function topEntries(map: Map<string, number>, n: number): string[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key]) => key);
}

interface CitationCandidate {
  id: string;
  name: string;
  weight: number;
  /** True if this title matched via a tone/theme/mood keyword rather than
   *  (or in addition to) a bare genre overlap -- see the comment above the
   *  candidates map that sets this. Preferred as citation evidence since
   *  it's more specific to the archetype than genre alone. */
  keywordMatch: boolean;
}

/** How many different archetypes any single title is allowed to be cited
 *  under. Without a cap, a handful of five-star titles that happen to span
 *  many genres end up "explaining" almost every archetype at once, which
 *  reads as the app reusing the same few movies rather than actually
 *  drawing on someone's full rated catalogue. 2 lets a title that
 *  genuinely straddles two categories (a film can honestly be both
 *  Neo-Noir and Prestige Drama) show up twice, but no more. */
const MAX_CITATIONS_PER_TITLE = 2;

/**
 * Picks each archetype's displayed citedTitles from its candidate pool
 * with a view across ALL archetypes at once, instead of each archetype
 * picking independently (which is what let the same few high-weight,
 * multi-genre titles dominate every category's "evidence"). Archetypes
 * with the highest percent get first pick of their best evidence; once a
 * title has been cited MAX_CITATIONS_PER_TITLE times anywhere, later
 * (lower-confidence) archetypes simply leave it out rather than reusing
 * it anyway -- an archetype showing 1-2 citations instead of 3 is a more
 * honest result than forcing in a title that's already "spoken for"
 * elsewhere. (An archetype with zero eligible candidates, capped-out or
 * otherwise, already renders fine with an empty citedTitles -- see the
 * "Horror & Dread" case in the tests.)
 */
function assignCitations(
  archetypeStats: { name: string; percent: number; candidates: CitationCandidate[] }[]
): Map<string, { id: string; name: string }[]> {
  const useCount = new Map<string, number>();
  const result = new Map<string, { id: string; name: string }[]>();

  const byConfidence = [...archetypeStats].sort((a, b) => b.percent - a.percent);

  for (const stat of byConfidence) {
    const ranked = [...stat.candidates].sort((a, b) => {
      if (a.keywordMatch !== b.keywordMatch) return a.keywordMatch ? -1 : 1;
      return b.weight - a.weight;
    });

    const picked: CitationCandidate[] = [];
    for (const c of ranked) {
      if (picked.length >= 3) break;
      if ((useCount.get(c.id) ?? 0) < MAX_CITATIONS_PER_TITLE) picked.push(c);
    }

    for (const p of picked) useCount.set(p.id, (useCount.get(p.id) ?? 0) + 1);
    result.set(
      stat.name,
      picked.map((p) => ({ id: p.id, name: p.name }))
    );
  }

  return result;
}

function weightedAverage(values: { value: number; weight: number }[]): number | null {
  const totalWeight = values.reduce((sum, v) => sum + v.weight, 0);
  if (totalWeight === 0) return null;
  return values.reduce((sum, v) => sum + v.value * v.weight, 0) / totalWeight;
}

/** Weighted percent-of-total breakdown over an arbitrary per-row tag list
 *  (used for both the mood/tone breakdown and, via a 1-tag picker, the
 *  language breakdown) -- shared so both dimensions round and sort the
 *  same way. */
function weightedBreakdown(
  rows: RatedTitleFeatures[],
  tagsOf: (r: RatedTitleFeatures) => string[],
  totalWeight: number,
  n: number
): { tag: string; percent: number }[] {
  const scores = new Map<string, number>();
  for (const r of rows) {
    for (const tag of tagsOf(r)) {
      scores.set(tag, (scores.get(tag) ?? 0) + r.weight);
    }
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([tag, weight]) => ({ tag, percent: totalWeight > 0 ? Math.round((weight / totalWeight) * 100) : 0 }));
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

  // Citation evidence is assigned in two phases. Phase 1 (below) builds,
  // per archetype, the full pool of titles that actually matched its
  // genre/keyword criteria -- same as before. Phase 2 (assignCitations,
  // after this map) then picks each archetype's displayed citedTitles from
  // that pool with a cross-archetype view, rather than each archetype
  // independently grabbing its own highest-weight matches. Independent
  // per-archetype picking is what caused the same handful of five-star,
  // multi-genre-spanning titles (a Drama/Thriller epic, say) to get cited
  // as "evidence" under nearly every archetype -- they legitimately match
  // many archetypes' criteria AND always have the highest weight, so they
  // won every tie. Phase 2 spreads citations across the user's full rated
  // catalogue by capping how many different archetypes any one title can
  // be cited under.
  const archetypeStats = ARCHETYPES.map((archetype) => {
    let genreHitWeight = 0;
    const candidates = new Map<string, CitationCandidate>();

    for (const r of positivelyRated) {
      const genreHit = archetype.genres.length > 0 && r.genres.some((g) => archetype.genres.includes(g));
      const extraHit = archetype.extraMatch?.(r) ?? false;
      if (genreHit || extraHit) {
        genreHitWeight += r.weight;
        if (r.titleId && r.titleName) {
          const existing = candidates.get(r.titleId);
          if (!existing || r.weight > existing.weight) {
            candidates.set(r.titleId, {
              id: r.titleId,
              name: r.titleName,
              weight: r.weight,
              keywordMatch: existing?.keywordMatch ?? false,
            });
          }
        }
      }
    }
    const genreShare = totalWeight > 0 ? genreHitWeight / totalWeight : 0;

    let tagHitWeight = 0;
    const keywordCounts = new Map<string, number>();
    for (const r of enriched) {
      const haystack = [...r.tone, ...r.themes, ...r.moodTags];
      const matched = matchingKeywords(haystack, archetype.keywords);
      if (matched.length > 0) {
        tagHitWeight += r.weight;
        if (r.titleId && r.titleName) {
          const existing = candidates.get(r.titleId);
          candidates.set(r.titleId, {
            id: r.titleId,
            name: r.titleName,
            weight: existing ? Math.max(existing.weight, r.weight) : r.weight,
            // A keyword hit is more specific evidence than a bare genre
            // overlap (lots of titles are "Drama"; far fewer are tagged
            // "morally gray"), so once true this should stick even if the
            // title was first added via the genre pass above.
            keywordMatch: true,
          });
        }
        for (const kw of matched) keywordCounts.set(kw, (keywordCounts.get(kw) ?? 0) + 1);
      }
    }
    const tagShare = totalTaggedWeight > 0 ? tagHitWeight / totalTaggedWeight : 0;

    const blended = totalTaggedWeight > 0 ? 0.55 * genreShare + 0.45 * tagShare : genreShare;

    return {
      name: archetype.name,
      percent: Math.round(Math.min(blended, 1) * 100),
      candidates: [...candidates.values()],
      matchedKeywords: topEntries(keywordCounts, 3),
    };
  });

  const citedByArchetype = assignCitations(archetypeStats);

  const archetypes: ArchetypeScore[] = archetypeStats
    .map((stat) => ({
      name: stat.name,
      percent: stat.percent,
      citedTitles: citedByArchetype.get(stat.name) ?? [],
      matchedKeywords: stat.matchedKeywords,
    }))
    .sort((a, b) => b.percent - a.percent);

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

  const moodBreakdown = weightedBreakdown(
    enriched,
    (r) => [...r.tone, ...r.themes, ...r.moodTags],
    totalTaggedWeight,
    6
  ).map(({ tag, percent }) => ({ tag, percent }));

  const languageBreakdown = weightedBreakdown(
    positivelyRated,
    (r) => (r.originalLanguage ? [r.originalLanguage] : []),
    totalWeight,
    5
  ).map(({ tag, percent }) => ({ label: languageLabel(tag), percent }));

  const eraDistribution = [...decadeScore.entries()]
    .sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10))
    .map(([decade, weight]) => ({
      decade,
      percent: totalWeight > 0 ? Math.round((weight / totalWeight) * 100) : 0,
    }));

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
    moodBreakdown,
    languageBreakdown,
    eraDistribution,
  };
}
