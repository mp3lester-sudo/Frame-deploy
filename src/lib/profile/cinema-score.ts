import type { ExperienceTier } from "@/lib/constants/experience-tier";

/**
 * Cinema Score: an earned replacement for what used to be a self-reported
 * "what kind of moviegoer are you" pick made once during onboarding
 * (profiles.experience_tier). That column and its rookie/intermediate/pro
 * values are kept -- same labels (Casual Viewer / Film Buff / Cinephile),
 * same badge on the profile -- but the value driving which one shows is
 * now computed from actual watching/reviewing activity instead of picked
 * once and never revisited. The write paths (onboarding's tier picker,
 * the Settings editor) have been removed in the same change this ships
 * with; see src/lib/actions/profile.ts's getCinemaScore.
 *
 * +50 points for every title watched. A rating counts as "watched" here,
 * matching the convention already used everywhere else in this app (the
 * Watched stat chip, /profile/[username]/watched) -- there's no
 * rating-free watch record actually in use. +50 MORE (100 total) if that
 * same title also has a review: writing about something is a heavier
 * lift than a star tap, and a review with no rating still counts as
 * watched on its own, since writing about a title implies having seen it.
 */
export const POINTS_PER_WATCHED = 50;
export const POINTS_PER_REVIEWED_BONUS = 50; // added on top of the base 50 -- 100 total for a watched+reviewed title

export const CINEMA_TIER_THRESHOLDS: { intermediate: number; pro: number } = {
  intermediate: 1000, // roughly 20 titles watched
  pro: 5000, // roughly 100 titles watched, or fewer with regular reviews
};

export function computeCinemaPoints(watchedCount: number, reviewedCount: number): number {
  const safeWatched = Math.max(0, watchedCount);
  const safeReviewed = Math.max(0, reviewedCount);
  return safeWatched * POINTS_PER_WATCHED + safeReviewed * POINTS_PER_REVIEWED_BONUS;
}

export function tierForPoints(points: number): ExperienceTier {
  if (points >= CINEMA_TIER_THRESHOLDS.pro) return "pro";
  if (points >= CINEMA_TIER_THRESHOLDS.intermediate) return "intermediate";
  return "rookie";
}
