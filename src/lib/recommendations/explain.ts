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
  /** "Because you loved <this>" — set only when a real, close-enough match
   *  was found in the user's own rating history (see most_similar_liked_title,
   *  migration 0016). Never fabricated. */
  citedTitle: string | null;
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
  citedTitle: string | null;
  context?: CircumstantialContext;
}): ReasonDetail {
  const { title, hasStrongContentMatch, hasCollaborativeEdge, citedTitle, context } = params;
  const themes = title.themes ?? [];
  const tone = title.tone ?? [];
  const moodTags = title.mood_tags ?? [];

  const matchKind = determineMatchKind(hasStrongContentMatch, hasCollaborativeEdge, moodTags.length > 0);

  const note = context ? contextNote(title, context) : null;
  const suffix = note ? ` (${note})` : "";

  let headline: string;
  if (matchKind === "content" && citedTitle) {
    const traits = [themes[0], tone[0]].filter(Boolean).join(", ");
    headline = traits
      ? `Because you loved ${citedTitle} — similar ${traits}.${suffix}`
      : `Because you loved ${citedTitle}.${suffix}`;
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
    citedTitle,
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
    citedTitle: null,
  };
}
