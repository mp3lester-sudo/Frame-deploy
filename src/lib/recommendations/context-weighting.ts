import type { CircumstantialContext } from "@/lib/context/circumstantial";
import type { Database } from "@/lib/supabase/types";

type Title = Database["public"]["Tables"]["titles"]["Row"];

/** Minimal shape context weighting actually needs — keeps the pure function
 *  testable without dragging in the full generated Title row type. */
export type ContextualTitle = Pick<
  Title,
  "runtime_minutes" | "violence_level" | "comedy_level" | "emotional_intensity" | "dialogue_density" | "pacing"
>;

const SOMETHING_SHORT_MAX_RUNTIME = 100;
/** Below this, a title isn't just "under the cap" -- it's genuinely short,
 *  and gets its own soft boost (see below). Without this, something_short
 *  behaved identically to solo (unweighted) for any user whose naturally
 *  best-taste-matching titles already happened to clear the 100-minute
 *  bar, which is common -- the runtime exclusion alone often never fired,
 *  so the context added no real shape of its own. */
const SHORTEST_RUNTIME_BOOST = 90;

/**
 * Re-ranks (never re-fetches) candidates a context applies to. Returns null
 * to mean "exclude entirely" — used only for something_short's runtime cap,
 * which is a hard constraint, not a preference. Every other context is a
 * soft multiplier so a small catalogue never gets filtered down to nothing.
 */
export function contextMultiplier(title: ContextualTitle, context: CircumstantialContext): number | null {
  switch (context) {
    case "solo":
      return 1;

    case "date_night": {
      // A shared pick shouldn't blindside anyone with something brutal.
      if (title.violence_level != null && title.violence_level >= 4) return 0.5;
      const isEngaging =
        (title.emotional_intensity != null && title.emotional_intensity >= 3) ||
        (title.dialogue_density != null && title.dialogue_density >= 3);
      return isEngaging ? 1.15 : 1;
    }

    case "with_friends": {
      const isCrowdPleaser = (title.comedy_level != null && title.comedy_level >= 3) || title.pacing === "fast";
      const isSlowSlog = title.pacing === "slow" && (title.comedy_level == null || title.comedy_level <= 1);
      if (isCrowdPleaser) return 1.2;
      if (isSlowSlog) return 0.85;
      return 1;
    }

    case "background": {
      const isEasyToHaveOn =
        (title.emotional_intensity == null || title.emotional_intensity <= 2) &&
        (title.dialogue_density == null || title.dialogue_density <= 2);
      const isTooDemanding = title.emotional_intensity != null && title.emotional_intensity >= 4;
      if (isEasyToHaveOn) return 1.2;
      if (isTooDemanding) return 0.8;
      return 1;
    }

    case "something_short":
      if (title.runtime_minutes != null && title.runtime_minutes > SOMETHING_SHORT_MAX_RUNTIME) return null;
      // Graduated preference within the cap -- a 90-minute film reads as
      // more genuinely "something short" than a 99-minute one, even
      // though both clear the hard limit above.
      if (title.runtime_minutes != null && title.runtime_minutes <= SHORTEST_RUNTIME_BOOST) return 1.15;
      return 1;

    default:
      return 1;
  }
}

/** A short, honest addendum to the rule-based recommendation reason — only
 *  added when the context materially explains why this pick showed up. */
export function contextNote(title: ContextualTitle, context: CircumstantialContext): string | null {
  switch (context) {
    case "date_night":
      return title.violence_level != null && title.violence_level >= 4
        ? null
        : "a good one to watch together";
    case "with_friends":
      return (title.comedy_level != null && title.comedy_level >= 3) || title.pacing === "fast"
        ? "an easy crowd-pleaser"
        : null;
    case "background":
      return "light enough to have on without full attention";
    case "something_short":
      return title.runtime_minutes ? `just ${title.runtime_minutes} minutes` : null;
    case "solo":
    default:
      return null;
  }
}
