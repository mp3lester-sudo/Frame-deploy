/**
 * Demo dataset for the new contextual home page (src/app/page.tsx +
 * src/components/home/*). The real recommendation engine (Phase 6) needs a
 * populated catalogue + rated titles to produce output like this; until the
 * TMDB ingestion worker exists, the home page renders this fixed demo so the
 * intended experience — context-aware hero pick, mood row, movie night,
 * social circle — is visible end-to-end. Swap this for
 * `getRecommendationsForUser` output once the catalogue is seeded.
 */

export const demoContext = {
  location: "New York, NY",
  weather: "46°F · Rain",
  ratingsCount: 13,
};

export const quickFilters = ["2 hours", "With someone", "Something calmer", "Surprise me"] as const;
export type QuickFilter = (typeof quickFilters)[number];

const TMDB_IMG = "https://image.tmdb.org/t/p/w500";

export const heroRecommendation = {
  matchPercent: 62,
  genreBadge: "Action",
  title: "The Dark Knight",
  year: 2008,
  director: "Christopher Nolan",
  runtimeMinutes: 152,
  genres: ["Action", "Crime"],
  reason: "Because you loved Ex Machina — this has the same tense quality.",
  posterUrl: `${TMDB_IMG}/qJ2tW6WMUDux911r6m7haRef0WH.jpg`,
};

export const moodRow = [
  {
    genreBadge: "Thriller",
    title: "Prisoners",
    matchPercent: 49,
    posterUrl: `${TMDB_IMG}/uhviyknTT5cEQXbn6vWIqfM4vGm.jpg`,
  },
  {
    genreBadge: "Sci-Fi",
    title: "Blade Runner 2049",
    matchPercent: 46,
    posterUrl: `${TMDB_IMG}/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg`,
  },
];

export const movieNight = {
  participants: [
    { initial: "J", name: "Jordan" },
    { initial: "M", name: "Maya" },
    { initial: "R", name: "Ravi" },
  ],
  copy: "Three friends, picking for Friday",
  status: "Waiting on your vote",
};

export const circleFeed = [
  {
    kind: "rated" as const,
    initial: "M",
    name: "Maya",
    titleName: "The Zone of Interest",
    rating: 5,
    quote: "Couldn't look away and didn't want to. One of the year's best.",
    reactions: [
      { label: "Agree", count: 6 },
      { label: "Hot take", count: 1 },
    ],
  },
  {
    kind: "watched" as const,
    initial: "J",
    name: "Jordan",
    titleName: "Perfect Days",
    quote: "Quietest film I've seen all year, in the best way.",
    reactions: [{ label: "Need to watch", count: 3 }],
  },
  {
    kind: "compatibility" as const,
    initial: "R",
    name: "Ravi",
    compatibilityPercent: 45,
    blurb: "Both love Villeneuve and slow cinema, both skip cheap jump scares.",
  },
];
