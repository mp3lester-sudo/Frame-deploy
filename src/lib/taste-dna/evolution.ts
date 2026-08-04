/**
 * Taste evolution — pure logic (no I/O), same split as archetypes.ts.
 *
 * Letterboxd's Year in Review is a snapshot: a static tally of what you
 * watched. This is meant to be alive — split a user's rating history
 * chronologically into an earlier half and a recent half, run the existing
 * Taste DNA scoring (computeTasteDnaFromRatings) on each half separately,
 * and diff them. No new schema, no snapshot table, no cron job — it's all
 * derived on demand from ratings Backlot already has, which also means it
 * works retroactively on rating history that predates this feature.
 */
import { computeTasteDnaFromRatings, type RatedTitleFeatures, type TasteDnaResult } from "./archetypes";

export interface RatedTitleFeaturesWithTime extends RatedTitleFeatures {
  /** ISO timestamp the rating was made — only field evolution needs beyond
   *  what archetypes.ts already requires. */
  ratedAt: string;
}

export interface ArchetypeShift {
  name: string;
  from: number;
  to: number;
}

export interface DimensionShift {
  from: number;
  to: number;
}

export interface TasteEvolutionResult {
  earlierSampleSize: number;
  recentSampleSize: number;
  /** Human-readable sentences, strongest shift first — empty when nothing
   *  crossed the noise threshold, even if there's enough sample size. */
  insights: string[];
  risingArchetypes: ArchetypeShift[];
  fadingArchetypes: ArchetypeShift[];
  pacingShift: { from: string; to: string } | null;
  violenceShift: DimensionShift | null;
  comedyShift: DimensionShift | null;
  emotionalIntensityShift: DimensionShift | null;
}

const MIN_TOTAL_FOR_EVOLUTION = 6;
const MIN_PER_BUCKET = 3;
/** Below this point-swing, an archetype shift reads as noise, not a trend. */
const ARCHETYPE_NOISE_FLOOR = 12;
/** Below this, a 0-5 dimension shift isn't worth mentioning. */
const DIMENSION_NOISE_FLOOR = 1;
const MAX_ARCHETYPE_INSIGHTS = 2;

/**
 * How many rising/fading archetype insights to surface, per direction --
 * exported so lib/taste-dna/compute.ts can pass a higher cap for Auteur
 * subscribers (task #343's "extended... evolution timeline" perk) while
 * everyone else keeps the original MAX_ARCHETYPE_INSIGHTS. Same
 * risingArchetypes/fadingArchetypes are always computed in full either
 * way -- this only changes how many of them get turned into prose
 * insights.
 */
export function computeTasteEvolution(
  rated: RatedTitleFeaturesWithTime[],
  maxArchetypeInsights: number = MAX_ARCHETYPE_INSIGHTS
): TasteEvolutionResult | null {
  if (rated.length < MIN_TOTAL_FOR_EVOLUTION) return null;

  const sorted = [...rated].sort((a, b) => new Date(a.ratedAt).getTime() - new Date(b.ratedAt).getTime());
  const midpoint = Math.floor(sorted.length / 2);
  const earlier = sorted.slice(0, midpoint);
  const recent = sorted.slice(midpoint);

  if (earlier.length < MIN_PER_BUCKET || recent.length < MIN_PER_BUCKET) return null;

  const earlierDna = computeTasteDnaFromRatings(earlier);
  const recentDna = computeTasteDnaFromRatings(recent);

  const insights: string[] = [];

  const { risingArchetypes, fadingArchetypes } = diffArchetypes(earlierDna, recentDna);
  for (const a of risingArchetypes.slice(0, maxArchetypeInsights)) {
    insights.push(`You've been leaning more into ${a.name} lately (${a.from}% → ${a.to}%).`);
  }
  for (const a of fadingArchetypes.slice(0, maxArchetypeInsights)) {
    insights.push(`${a.name} has faded from your recent ratings (${a.from}% → ${a.to}%).`);
  }

  const pacingShift =
    earlierDna.pacingPreference && recentDna.pacingPreference && earlierDna.pacingPreference !== recentDna.pacingPreference
      ? { from: earlierDna.pacingPreference, to: recentDna.pacingPreference }
      : null;
  if (pacingShift) {
    insights.push(`Your pacing preference has shifted from ${pacingShift.from} to ${pacingShift.to}.`);
  }

  const violenceShift = diffDimension(earlierDna.violenceTolerance, recentDna.violenceTolerance);
  if (violenceShift) {
    const direction = violenceShift.to > violenceShift.from ? "risen" : "eased";
    insights.push(`Your violence tolerance has ${direction} (${violenceShift.from} → ${violenceShift.to} out of 5).`);
  }

  const comedyShift = diffDimension(earlierDna.comedyTolerance, recentDna.comedyTolerance);
  if (comedyShift) {
    const direction = comedyShift.to > comedyShift.from ? "grown" : "faded";
    insights.push(`Your appetite for comedy has ${direction} (${comedyShift.from} → ${comedyShift.to} out of 5).`);
  }

  const emotionalIntensityShift = diffDimension(
    earlierDna.emotionalIntensityPreference,
    recentDna.emotionalIntensityPreference
  );
  if (emotionalIntensityShift) {
    const direction = emotionalIntensityShift.to > emotionalIntensityShift.from ? "heavier" : "lighter";
    insights.push(
      `You've been drawn to emotionally ${direction} films lately (${emotionalIntensityShift.from} → ${emotionalIntensityShift.to} out of 5).`
    );
  }

  return {
    earlierSampleSize: earlier.length,
    recentSampleSize: recent.length,
    insights,
    risingArchetypes,
    fadingArchetypes,
    pacingShift,
    violenceShift,
    comedyShift,
    emotionalIntensityShift,
  };
}

function diffArchetypes(
  earlierDna: TasteDnaResult,
  recentDna: TasteDnaResult
): { risingArchetypes: ArchetypeShift[]; fadingArchetypes: ArchetypeShift[] } {
  const earlierByName = new Map(earlierDna.archetypes.map((a) => [a.name, a.percent]));
  const recentByName = new Map(recentDna.archetypes.map((a) => [a.name, a.percent]));

  const shifts: ArchetypeShift[] = [];
  for (const [name, to] of recentByName) {
    const from = earlierByName.get(name) ?? 0;
    if (Math.abs(to - from) >= ARCHETYPE_NOISE_FLOOR) shifts.push({ name, from, to });
  }

  const delta = (s: ArchetypeShift) => s.to - s.from;
  return {
    risingArchetypes: shifts.filter((s) => s.to > s.from).sort((a, b) => delta(b) - delta(a)),
    fadingArchetypes: shifts.filter((s) => s.to < s.from).sort((a, b) => delta(a) - delta(b)),
  };
}

function diffDimension(from: number | null, to: number | null): DimensionShift | null {
  if (from == null || to == null) return null;
  if (Math.abs(to - from) < DIMENSION_NOISE_FLOOR) return null;
  return { from, to };
}
