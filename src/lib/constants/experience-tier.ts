// A user's self-reported film-fan tier — chosen once during onboarding
// (src/components/onboarding/onboarding-swipe.tsx) and editable afterward
// in Settings (src/components/settings/experience-tier-editor.tsx). Shown
// as a badge on profile pages (it's meant to be public — "outing yourself"
// as a certain kind of viewer, not a private preference).
//
// The underlying stored values (rookie/intermediate/pro) are plain and
// stable; ExperienceTier.label is the film-flavored copy actually shown,
// kept separate so the display wording can change later without touching
// the database.
export type ExperienceTier = "rookie" | "intermediate" | "pro";

export const EXPERIENCE_TIERS: {
  value: ExperienceTier;
  label: string;
  description: string;
}[] = [
  {
    value: "rookie",
    label: "Casual Viewer",
    description: "You watch what looks good — no deep cuts required.",
  },
  {
    value: "intermediate",
    label: "Film Buff",
    description: "You've got opinions on directors and know your way around a genre.",
  },
  {
    value: "pro",
    label: "Cinephile",
    description: "Criterion collection, film school trivia, the works.",
  },
];

export const EXPERIENCE_TIER_LABEL: Record<ExperienceTier, string> = Object.fromEntries(
  EXPERIENCE_TIERS.map((t) => [t.value, t.label])
) as Record<ExperienceTier, string>;
