import type { Database } from "@/lib/supabase/types";
import { isRoughWeather } from "@/lib/context/circumstantial";

type Title = Database["public"]["Tables"]["titles"]["Row"];

/** Minimal shape weather/time weighting needs — separate from
 *  ContextualTitle (context-weighting.ts) since this reasons about mood_tags
 *  and tone rather than runtime/violence/pacing. */
export type WeatherableTitle = Pick<Title, "mood_tags" | "tone" | "runtime_minutes">;

export interface WeatherTimeSignal {
  /** Open-Meteo WMO weather_code, or null when weather couldn't be read
   *  (no geolocation, fetch failure, etc.) — every rule below degrades to a
   *  no-op when this is null rather than guessing. */
  weatherCode: number | null;
  tempF: number | null;
  /** Local hour in the visitor's own timezone, 0-23. */
  hour: number;
}

// Tag/tone vocabulary actually produced by enrich-titles.ts — checked
// against the live catalogue rather than guessed, since made-up tags
// (e.g. "cozy", which the enrichment prompt never produces) would silently
// never match anything.
const COMFORT_MOOD_TAGS = ["nostalgic", "heartwarming", "feel-good", "warm", "charming"];
const LIGHT_TONE = ["lighthearted", "hopeful", "uplifting", "playful", "whimsical", "feel-good"];
const HEAVY_TONE = ["dark", "gritty", "somber", "melancholic", "bleak"];

const COLD_TEMP_F = 45;
const WARM_TEMP_F = 72;
const LATE_NIGHT_RUNTIME_CAP = 140;

/**
 * A soft multiplier layered on top of contextMultiplier — where that models
 * a *chosen* circumstance (solo, date night, ...), this models the ambient
 * conditions nobody picked but that still shape what sounds good: rain and
 * cold pull people toward comfort-watch territory, a bright warm afternoon
 * pulls away from bleak/heavy tone, and very late at night a 3-hour epic is
 * a harder sell regardless of taste match. Every rule is a mild nudge
 * (0.85-1.15), never a hard exclusion — bad weather shouldn't make a
 * genuinely great match disappear, just rank a comfort pick slightly above
 * an equally-good but colder one.
 */
export function weatherTimeMultiplier(title: WeatherableTitle, signal: WeatherTimeSignal): number {
  let multiplier = 1;
  const moodTags = (title.mood_tags ?? []).map((t) => t.toLowerCase());
  const tone = (title.tone ?? []).map((t) => t.toLowerCase());

  const rough = isRoughWeather(signal.weatherCode);
  const cold = signal.tempF != null && signal.tempF <= COLD_TEMP_F;
  const warmAndClear = !rough && signal.tempF != null && signal.tempF >= WARM_TEMP_F;

  if ((rough || cold) && moodTags.some((t) => COMFORT_MOOD_TAGS.includes(t))) {
    multiplier *= 1.15;
  }

  if (warmAndClear && signal.hour >= 10 && signal.hour < 19) {
    if (tone.some((t) => LIGHT_TONE.includes(t))) multiplier *= 1.1;
    if (tone.some((t) => HEAVY_TONE.includes(t))) multiplier *= 0.9;
  }

  const isLateNight = signal.hour >= 22 || signal.hour < 6;
  if (isLateNight && title.runtime_minutes != null && title.runtime_minutes > LATE_NIGHT_RUNTIME_CAP) {
    multiplier *= 0.9;
  }

  return multiplier;
}

/** Short, honest addendum naming *why* weather/time nudged a pick — only
 *  returned when a rule above actually fired, mirroring contextNote's
 *  "don't fabricate a reason" rule. */
export function weatherTimeNote(title: WeatherableTitle, signal: WeatherTimeSignal): string | null {
  const moodTags = (title.mood_tags ?? []).map((t) => t.toLowerCase());
  const tone = (title.tone ?? []).map((t) => t.toLowerCase());

  const rough = isRoughWeather(signal.weatherCode);
  const cold = signal.tempF != null && signal.tempF <= COLD_TEMP_F;
  const warmAndClear = !rough && signal.tempF != null && signal.tempF >= WARM_TEMP_F;

  if ((rough || cold) && moodTags.some((t) => COMFORT_MOOD_TAGS.includes(t))) {
    return rough ? "a comfort watch for the weather outside" : "cozy for a cold one";
  }
  if (warmAndClear && signal.hour >= 10 && signal.hour < 19 && tone.some((t) => LIGHT_TONE.includes(t))) {
    return "light enough for a bright day";
  }
  return null;
}
