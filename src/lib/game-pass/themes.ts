/**
 * Monthly Game Pass theme presets — pure data + a deterministic rotation
 * function, no I/O. A new season's theme_genres/theme_keywords feed
 * generate-picks.ts's candidate filter; the actual per-day titles are still
 * personalized per user within whichever theme is live that month.
 *
 * Hollywood Boulevard is deliberately first in the array and anchored to
 * EPOCH_MONTH below, so it's the flagship theme for the first real season
 * this feature ever runs — classic, star-driven, legend-of-cinema titles,
 * echoing the actual Walk of Fame the board's visual design is built around.
 */
export interface ThemePreset {
  name: string;
  description: string;
  genres: string[];
  keywords: string[];
  decadeMin: number | null;
  decadeMax: number | null;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    name: "Hollywood Boulevard",
    description:
      "The legends that paved the walk of fame — iconic performances, career-defining roles, the films everyone name-drops.",
    genres: ["Drama", "Romance", "Musical"],
    keywords: ["legendary", "iconic", "stardom", "fame", "glamour", "career-defining", "classic"],
    decadeMin: null,
    decadeMax: null,
  },
  {
    name: "Neo-Noir Nights",
    description: "Rain-slicked streets, morally gray protagonists, a city that never quite lets you go.",
    genres: ["Crime", "Thriller", "Mystery"],
    keywords: ["noir", "morally gray", "corrupt", "cynical", "femme fatale", "shadow", "detective"],
    decadeMin: null,
    decadeMax: null,
  },
  {
    name: "Festival Favorites",
    description: "The kind of quiet, precise filmmaking that wins a standing ovation at Cannes.",
    genres: ["Drama"],
    keywords: ["contemplative", "meditative", "poetic", "understated", "restrained"],
    decadeMin: null,
    decadeMax: null,
  },
  {
    name: "Summer Blockbusters",
    description: "Big swings, bigger stakes — the popcorn-movie canon.",
    genres: ["Action", "Adventure", "Science Fiction"],
    keywords: ["epic", "spectacle", "thrilling", "large-scale", "adrenaline"],
    decadeMin: null,
    decadeMax: null,
  },
  {
    name: "Midnight Horror",
    description: "Lights off, one more episode be damned — dread that lingers past the credits.",
    genres: ["Horror"],
    keywords: ["dread", "unsettling", "visceral", "terrifying", "supernatural", "creeping"],
    decadeMin: null,
    decadeMax: null,
  },
  {
    name: "Second Chances",
    description: "Comebacks, redemption arcs, people trying to become who they were supposed to be.",
    genres: ["Drama"],
    keywords: ["redemption", "healing", "second chance", "reckoning", "forgiveness"],
    decadeMin: null,
    decadeMax: null,
  },
  {
    name: "World Cinema Passport",
    description: "A month-long trip through filmmaking traditions that never needed Hollywood's permission.",
    genres: [],
    keywords: ["poetic", "understated", "intimate"],
    decadeMin: null,
    decadeMax: null,
  },
  {
    name: "Sharp Comedies",
    description: "Wit as a weapon — the funniest, most quotable scripts ever produced.",
    genres: ["Comedy"],
    keywords: ["witty", "satirical", "absurd", "deadpan", "irreverent", "sharp dialogue"],
    decadeMin: null,
    decadeMax: null,
  },
  {
    name: "Prestige Season",
    description: "The kind of somber, meticulous filmmaking awards voters can't resist.",
    genres: ["Drama", "History", "War"],
    keywords: ["somber", "restrained", "legacy", "ambition", "period piece", "biograph"],
    decadeMin: null,
    decadeMax: null,
  },
  {
    name: "Animated & Unbound",
    description: "Everything live action can't do — a month of pure animated imagination.",
    genres: ["Animation"],
    keywords: ["imaginative", "whimsical", "inventive", "visually stunning"],
    decadeMin: null,
    decadeMax: null,
  },
];

/** Anchors Hollywood Boulevard (index 0) to the month this feature first
 *  runs — UTC month index, zero-based (6 = July). */
const EPOCH_MONTH = { year: 2026, month: 6 };

function monthsSinceEpoch(periodStart: Date): number {
  const months = (periodStart.getUTCFullYear() - EPOCH_MONTH.year) * 12 + (periodStart.getUTCMonth() - EPOCH_MONTH.month);
  return months;
}

/** Deterministic — the same calendar month always resolves to the same
 *  theme, so concurrent requests creating a season never disagree, and a
 *  given month reads the same theme forever once it's happened. */
export function pickThemeForMonth(periodStart: Date): ThemePreset {
  const months = monthsSinceEpoch(periodStart);
  const index = ((months % THEME_PRESETS.length) + THEME_PRESETS.length) % THEME_PRESETS.length;
  return THEME_PRESETS[index];
}
