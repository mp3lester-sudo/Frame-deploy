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

/**
 * Letter grade -- what's actually shown on the profile stat strip.
 * `computeCinemaPoints` above was only ever built to gate the three-tier
 * rookie/intermediate/pro badge, and its raw output (e.g. 11950 for
 * someone with 239 watched titles) was never meant to be displayed on
 * its own -- a bare four/five-digit number with no unit reads as a
 * glitch, not a stat.
 *
 * Named and shaped after the real CinemaScore: the market-research firm
 * that polls opening-night theater audiences and grades the movie
 * itself A+ through F. Same letter scale, same "audience report card"
 * read -- just turned around to grade the *person's* moviegoing instead
 * of one film's opening night. It's a natural fit for an app that
 * already borrows Rotten Tomatoes' percentage badge for individual
 * titles; this is the personal equivalent.
 *
 * Eleven steps, not three -- deliberately finer than the tier badge so
 * the number keeps moving between rookie/intermediate/pro promotions
 * instead of sitting still for dozens of titles at a time. The C+ and A
 * cutoffs are pinned to the existing CINEMA_TIER_THRESHOLDS values
 * (1000 / 5000) on purpose, so the letter grade and the tier badge
 * always agree at the two boundaries that matter instead of quietly
 * contradicting each other (e.g. never "Film Buff" but a "C-").
 */
const GRADE_THRESHOLDS: [minPoints: number, grade: string][] = [
  [0, "F"],
  [150, "D"],
  [400, "C-"],
  [800, "C"],
  [CINEMA_TIER_THRESHOLDS.intermediate, "C+"], // 1000 -- matches "intermediate"/Film Buff
  [1500, "B-"],
  [2200, "B"],
  [3000, "B+"],
  [4000, "A-"],
  [CINEMA_TIER_THRESHOLDS.pro, "A"], // 5000 -- matches "pro"/Cinephile
  [7500, "A+"],
];

export function letterGradeForPoints(points: number): string {
  const safe = Math.max(0, points);
  let grade = GRADE_THRESHOLDS[0][1];
  for (const [min, letter] of GRADE_THRESHOLDS) {
    if (safe >= min) grade = letter;
    else break;
  }
  return grade;
}

/**
 * How far through the CURRENT letter grade's band a point total sits, as
 * a 0-1 fraction -- drives the radial "seal" ring's fill on the profile
 * page (CinemaScoreSeal) so the badge reads as a live progress meter
 * toward the next grade, not just a static letter. Walks the same
 * threshold table with the same "keep the last band whose floor we've
 * cleared" logic as letterGradeForPoints above, on purpose -- computing
 * the band index any other way risks the ring and the letter disagreeing
 * about which grade is actually current.
 *
 * A+ has no ceiling (nothing to progress toward once you're the top
 * grade), so it always reads as a full ring rather than a fraction that
 * can never reach 1.
 */
export function gradeProgress(points: number): number {
  const safe = Math.max(0, points);
  let bandIndex = 0;
  for (let i = 0; i < GRADE_THRESHOLDS.length; i++) {
    if (safe >= GRADE_THRESHOLDS[i][0]) bandIndex = i;
    else break;
  }
  const [bandMin] = GRADE_THRESHOLDS[bandIndex];
  const nextBand = GRADE_THRESHOLDS[bandIndex + 1];
  if (!nextBand) return 1; // A+ -- top of the scale, always full
  const [nextMin] = nextBand;
  const span = nextMin - bandMin;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (safe - bandMin) / span));
}
