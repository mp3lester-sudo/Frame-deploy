import type { CircumstantialContext } from "@/lib/context/circumstantial";
import { contextNote, type ContextualTitle } from "./context-weighting";

export type MatchKind = "content" | "mood" | "generic";

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
  /** Multi-sentence expansion of `headline` — shown in the "Why this pick"
   *  expandable section. Built entirely from real signals this pick
   *  actually had (citations, match kind, the title's own themes/tone/mood/
   *  pacing/ending, context/weather notes) — never a generic filler
   *  sentence, and never a signal that wasn't actually true for this pick. */
  longReason: string;
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

function determineMatchKind(hasStrongContentMatch: boolean, hasMoodTags: boolean): MatchKind {
  if (hasStrongContentMatch) return "content";
  if (hasMoodTags) return "mood";
  return "generic";
}

export function buildReasonDetail(params: {
  title: ExplainableTitle;
  hasStrongContentMatch: boolean;
  citedTitles: string[];
  context?: CircumstantialContext;
  /** Set by the engine when weather/time materially nudged this pick (see
   *  weather-time-weighting.ts) — kept as a plain string rather than a
   *  signal object here so explain.ts doesn't need to know about weather
   *  codes or hours, just the sentence fragment to fold in. */
  weatherNote?: string | null;
}): ReasonDetail {
  const { title, hasStrongContentMatch, citedTitles, context, weatherNote } = params;
  const themes = title.themes ?? [];
  const tone = title.tone ?? [];
  const moodTags = title.mood_tags ?? [];

  const matchKind = determineMatchKind(hasStrongContentMatch, moodTags.length > 0);

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
  } else if (matchKind === "mood") {
    headline = `Fits your recent mood: ${moodTags.slice(0, 2).join(", ")}.${suffix}`;
  } else {
    headline = `Picked for you based on your Taste Graph.${suffix}`;
  }

  const longReason = buildLongReason({
    matchKind,
    title,
    themes,
    tone,
    moodTags,
    citedTitles,
    contextSuffixNote,
    weatherNote: weatherNote ?? null,
  });

  return {
    headline,
    longReason,
    themes,
    tone,
    moodTags,
    pacing: title.pacing ?? null,
    endingType: title.ending_type ?? null,
    citedTitles,
  };
}

/** Joins a list into "a", "a and b", or "a, b, and c" — used to fold
 *  multiple themes/tones into one readable sentence instead of a
 *  comma-splice or a truncated single trait. */
function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/**
 * The fuller, multi-sentence explanation behind `headline` — this is what
 * "learn each individual user to an absolute tee" actually looks like from
 * the outside: naming the specific titles, themes, tone, and pacing that
 * drove the pick, not just a one-line algorithmic gesture. Every clause
 * here maps to a real, checkable signal that was actually true for this
 * pick — nothing is invented to sound more personalized than it is.
 */
function buildLongReason(params: {
  matchKind: MatchKind;
  title: ExplainableTitle;
  themes: string[];
  tone: string[];
  moodTags: string[];
  citedTitles: string[];
  contextSuffixNote: string | null;
  weatherNote: string | null;
}): string {
  const { matchKind, title, themes, tone, moodTags, citedTitles, contextSuffixNote, weatherNote } = params;

  const themeText = themes.length ? joinList(themes.slice(0, 3)) : null;
  const toneText = tone.length ? joinList(tone.slice(0, 2)) : null;
  const pacing = title.pacing;
  const endingType = title.ending_type;

  const sentences: string[] = [];

  if (matchKind === "content" && citedTitles.length > 0) {
    const citedText = joinList(citedTitles);
    sentences.push(
      citedTitles.length === 1
        ? `We matched this to ${citedText} specifically — of everything in your rated history, it's the closest thing to this pick in our taste model, not just a genre-level guess.`
        : `We matched this to ${citedText} specifically — both sit closest to this pick in your taste model, which is a stronger signal than either alone.`
    );
    if (themeText) sentences.push(`Like those, it centers on ${themeText}${toneText ? `, carried with a ${toneText} tone` : ""}.`);
    else if (toneText) sentences.push(`It shares the same ${toneText} tone you responded to there.`);
  } else if (matchKind === "content") {
    sentences.push("Your taste profile — built from everything you've rated, not a generic category — places this as one of your closest overall matches in the catalogue.");
    if (themeText) sentences.push(`It leans into ${themeText}${toneText ? ` with a ${toneText} tone` : ""}, the register your ratings consistently favor.`);
  } else if (matchKind === "mood" && moodTags.length) {
    sentences.push(`This fits where your recent activity has been leaning: ${joinList(moodTags.slice(0, 3))}.`);
    if (themeText) sentences.push(`It's built around ${themeText}${toneText ? ` with a ${toneText} tone` : ""}.`);
  } else {
    sentences.push("We don't have a strong direct signal for this one yet, so it's leaning on your broader Taste Graph rather than a specific citation.");
    if (themeText) sentences.push(`It's centered on ${themeText}${toneText ? ` with a ${toneText} tone` : ""}.`);
  }

  if (pacing || endingType) {
    const bits = [pacing ? `${pacing} pacing` : null, endingType ? `a ${endingType} ending` : null].filter(
      (b): b is string => !!b
    );
    sentences.push(`Expect ${joinList(bits)}.`);
  }

  if (contextSuffixNote) sentences.push(`${contextSuffixNote.charAt(0).toUpperCase()}${contextSuffixNote.slice(1)}.`);
  if (weatherNote) sentences.push(`${weatherNote.charAt(0).toUpperCase()}${weatherNote.slice(1)}.`);

  return sentences.join(" ");
}

/** Cold start (no taste vector yet) still surfaces the title's own
 *  theme/tone/mood detail in the expandable section — just with an honest
 *  headline that doesn't claim personalization that hasn't happened yet. */
export function buildColdStartDetail(title: ExplainableTitle): ReasonDetail {
  const themes = title.themes ?? [];
  const tone = title.tone ?? [];
  const themeText = themes.length ? joinList(themes.slice(0, 3)) : null;
  const toneText = tone.length ? joinList(tone.slice(0, 2)) : null;
  const longReason = [
    "You haven't rated enough yet for a personalized match, so this is one of the best-reviewed titles in the catalogue rather than something picked for your taste specifically.",
    themeText ? `It's built around ${themeText}${toneText ? ` with a ${toneText} tone` : ""}.` : null,
    "Rate a handful of titles and picks like this one will start reflecting your actual taste instead of general popularity.",
  ]
    .filter((s): s is string => !!s)
    .join(" ");
  return {
    headline: "Popular right now — rate a few titles to personalize this.",
    longReason,
    themes,
    tone,
    moodTags: title.mood_tags ?? [],
    pacing: title.pacing ?? null,
    endingType: title.ending_type ?? null,
    citedTitles: [],
  };
}
