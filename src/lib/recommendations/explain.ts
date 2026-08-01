import type { CircumstantialContext } from "@/lib/context/circumstantial";
import { contextNote, type ContextualTitle } from "./context-weighting";

export type MatchKind = "content" | "collaborative" | "mood" | "generic";

/** Minimal shape reasoning needs from a title row. */
export type ExplainableTitle = ContextualTitle & {
  themes: string[] | null;
  tone: string[] | null;
  mood_tags: string[] | null;
  ending_type: string | null;
};

export interface ReasonDetail {
  /** One-line summary — what MoodRow shows, and what Hero shows collapsed. */
  headline: string;
  themes: string[];
  tone: string[];
  moodTags: string[];
  pacing: string | null;
  endingType: string | null;
  /** "Because you loved X" or "Because you loved X and Y" — up to two
   *  titles from the user's own rating history that are the closest match
   *  to this pick (see most_similar_liked_title, migrations 0016/0032).
   *  Empty when nothing was a close enough match. Never fabricated. */
  citedTitles: string[];
}

function determineMatchKind(
  hasStrongContentMatch: boolean,
  hasCollaborativeEdge: boolean,
  hasMoodTags: boolean
): MatchKind {
  if (hasStrongContentMatch) return "content";
  if (hasCollaborativeEdge) return "collaborative";
  if (hasMoodTags) return "mood";
  return "generic";
}

export function buildReasonDetail(params: {
  title: ExplainableTitle;
  hasStrongContentMatch: boolean;
  hasCollaborativeEdge: boolean;
  citedTitles: string[];
  context?: CircumstantialContext;
  /** Set by the engine when weather/time materially nudged this pick (see
   *  weather-time-weighting.ts) — kept as a plain string rather than a
   *  signal object here so explain.ts doesn't need to know about weather
   *  codes or hours, just the sentence fragment to fold in. */
  weatherNote?: string | null;
}): ReasonDetail {
  const { title, hasStrongContentMatch, hasCollaborativeEdge, citedTitles, context, weatherNote } = params;
  const themes = title.themes ?? [];
  const tone = title.tone ?? [];
  const moodTags = title.mood_tags ?? [];

  const matchKind = determineMatchKind(hasStrongContentMatch, hasCollaborativeEdge, moodTags.length > 0);

  const contextSuffixNote = context ? contextNote(title, context) : null;
  const notes = [contextSuffixNote, weatherNote].filter((n): n is string => !!n);
  const suffix = notes.length ? ` (${notes.join("; ")})` : "";

  let headline: string;
  if (matchKind === "content" && citedTitles.length > 0) {
    if (citedTitles.length === 1) {
      // A single citation still gets a bit of extra texture from the
      // pick's own themes/tone — with two citations that reads as
      // clutter, so the two-title branch below keeps it to just the names.
      const traits = [themes[0], tone[0]].filter(Boolean).join(", ");
      headline = traits
        ? `Because you loved ${citedTitles[0]} — similar ${traits}.${suffix}`
        : `Because you loved ${citedTitles[0]}.${suffix}`;
    } else {
      headline = `Because you loved ${citedTitles[0]} and ${citedTitles[1]}.${suffix}`;
    }
  } else if (matchKind === "content") {
    headline = `Matches your taste closely — similar tone and pacing to what you love.${suffix}`;
  } else if (matchKind === "collaborative") {
    headline = `Loved by people whose taste overlaps with yours.${suffix}`;
  } else if (matchKind === "mood") {
    headline = `Fits your recent mood: ${moodTags.slice(0, 2).join(", ")}.${suffix}`;
  } else {
    headline = `Picked for you based on your Taste Graph.${suffix}`;
  }

  return {
    headline,
    themes,
    tone,
    moodTags,
    pacing: title.pacing ?? null,
    endingType: title.ending_type ?? null,
    citedTitles,
  };
}

/** Cold start (no taste vector yet) still surfaces the title's own
 *  theme/tone/mood detail in the expandable section — just with an honest
 *  headline that doesn't claim personalization that hasn't happened yet. */
export function buildColdStartDetail(title: ExplainableTitle): ReasonDetail {
  return {
    headline: "Popular right now — rate a few titles to personalize this.",
    themes: title.themes ?? [],
    tone: title.tone ?? [],
    moodTags: title.mood_tags ?? [],
    pacing: title.pacing ?? null,
    endingType: title.ending_type ?? null,
    citedTitles: [],
  };
}
