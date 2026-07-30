// Advanced Discover filters — a Premium-only perk (see /premium and
// CLAUDE.md's product principles: this is one of four advertised Premium
// features that existed only as marketing copy until now). Free accounts
// keep the existing genre-only filtering; these four extra dimensions are
// gated server-side in discover/page.tsx and catalogue.ts, not just hidden
// in the UI, so they can't be unlocked by hand-editing the URL.
//
// tone and mood are AI-enriched free-text arrays (scripts/enrich-titles.ts),
// not a fixed enum in the DB — these are a curated, representative subset
// rather than every string that's ever been generated, to keep the filter
// UI a manageable set of pills instead of an unbounded list.

export const ERA_DECADES: { label: string; start: number }[] = [
  { label: "2020s", start: 2020 },
  { label: "2010s", start: 2010 },
  { label: "2000s", start: 2000 },
  { label: "1990s", start: 1990 },
  { label: "1980s", start: 1980 },
  { label: "1970s", start: 1970 },
  { label: "1960s", start: 1960 },
  { label: "Before 1960", start: 0 },
];

export const PACING_OPTIONS: { label: string; value: string }[] = [
  { label: "Slow burn", value: "slow" },
  { label: "Moderate", value: "moderate" },
  { label: "Fast-paced", value: "fast" },
];

export const TONE_OPTIONS: string[] = [
  "Dark",
  "Hopeful",
  "Satirical",
  "Melancholic",
  "Whimsical",
  "Suspenseful",
  "Bittersweet",
  "Uplifting",
  "Intense",
  "Quirky",
];

export const MOOD_OPTIONS: string[] = [
  "Cozy",
  "Adventurous",
  "Thought-provoking",
  "Nostalgic",
  "Romantic",
  "Scary",
  "Feel-good",
  "Empowering",
  "Escapist",
  "Gritty",
];

export interface AdvancedDiscoverFilters {
  era?: string;
  pacing?: string;
  tone?: string;
  mood?: string;
}
