/**
 * "Circumstantial" recommendations — the other half of Marquee's differentiation
 * from Letterboxd (see the Taste Graph, which handles the personal half).
 * A context isn't a taste preference, it's what tonight actually looks like:
 * watching alone, with a date, with a group, half-paying-attention, or only
 * having 90 minutes free. The same taste profile should surface different
 * titles depending on which of these is true right now.
 */
export const CIRCUMSTANTIAL_CONTEXTS = [
  "solo",
  "date_night",
  "with_friends",
  "background",
  "something_short",
] as const;

export type CircumstantialContext = (typeof CIRCUMSTANTIAL_CONTEXTS)[number];

export const CONTEXT_LABELS: Record<CircumstantialContext, string> = {
  solo: "Solo",
  date_night: "Date night",
  with_friends: "With friends",
  background: "Background watch",
  something_short: "Something short",
};

export function isCircumstantialContext(value: string): value is CircumstantialContext {
  return (CIRCUMSTANTIAL_CONTEXTS as readonly string[]).includes(value);
}

/** Open-Meteo WMO weather_code groups that mean "it's actively bad out". */
export function isRoughWeather(weatherCode: number | null | undefined): boolean {
  if (weatherCode == null) return false;
  return (
    (weatherCode >= 51 && weatherCode <= 57) || // drizzle
    (weatherCode >= 61 && weatherCode <= 67) || // rain
    (weatherCode >= 80 && weatherCode <= 82) || // rain showers
    (weatherCode >= 71 && weatherCode <= 77) || // snow
    weatherCode === 85 ||
    weatherCode === 86 || // snow showers
    weatherCode >= 95 // thunderstorm
  );
}

