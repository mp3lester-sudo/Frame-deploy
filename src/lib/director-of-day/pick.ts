/**
 * "Director of the Day" — a single director surfaced on the home page,
 * personalized to this user's taste but rotating daily rather than
 * always being their single all-time favorite. Two separate concerns,
 * kept pure and unit-testable (the DB fetching that feeds them lives in
 * fetch.ts):
 *
 *  1. rankFavoriteDirectors — same weighting as taste-dna/archetypes.ts's
 *     directorScore (weight = max(rating - 2.5, 0), so only above-average
 *     ratings count, weighted by how far above average), kept as its own
 *     function here rather than re-imported from archetypes.ts because
 *     that module computes a lot of unrelated fields (genres, tone,
 *     pacing...) from the same rated-title shape; pulling in all of that
 *     just to get the director ranking would mean fetching columns this
 *     feature never uses.
 *  2. pickDirectorOfDay — deterministic function of (candidate list, user
 *     id, calendar day): same user + same day always yields the same
 *     director (so it doesn't change if the page reloads mid-day), but a
 *     different day yields a different index into the ranked shortlist,
 *     and different users with the same candidate never line up (the
 *     user id is part of the hash, not just the day). Deliberately NOT
 *     random/non-deterministic — a real per-day rotation, not a coin
 *     flip on every request.
 */

export interface RatedTitleDirector {
  titleId: string;
  score: number;
}

export interface DirectorCandidate {
  id: string;
  name: string;
  score: number;
}

export function rankFavoriteDirectors(
  ratings: RatedTitleDirector[],
  directorByTitle: Map<string, { id: string; name: string }>
): DirectorCandidate[] {
  const byDirector = new Map<string, { name: string; score: number }>();

  for (const r of ratings) {
    const director = directorByTitle.get(r.titleId);
    if (!director) continue;
    const weight = Math.max(r.score - 2.5, 0);
    if (weight <= 0) continue;
    const existing = byDirector.get(director.id);
    byDirector.set(director.id, {
      name: director.name,
      score: (existing?.score ?? 0) + weight,
    });
  }

  return [...byDirector.entries()]
    .map(([id, v]) => ({ id, name: v.name, score: v.score }))
    .sort((a, b) => b.score - a.score);
}

/** Simple deterministic string hash (djb2-ish) — no crypto needed, this
 *  only has to be stable and reasonably well-distributed, not secure. */
function hashString(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return Math.abs(hash);
}

/** Calendar day index (days since a fixed, arbitrary epoch) — used to walk
 *  through a per-user shuffle one position per day, wrapping around only
 *  once every candidate has had a turn. Parses dateKey's Y/M/D directly
 *  (not `new Date(dateKey)`) so this is immune to any local-timezone
 *  parsing quirks; the day boundary itself is still whatever the caller's
 *  dateKey already encodes. */
function daysSinceEpoch(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  const epoch = Date.UTC(2024, 0, 1);
  const day = Date.UTC(y, m - 1, d);
  return Math.floor((day - epoch) / 86_400_000);
}

/**
 * @param candidates Ranked shortlist (already sliced to a reasonable top
 *   N by the caller — e.g. top 8 — so the rotation stays within titles
 *   this user has actually responded well to, not their entire history).
 * @param userId Distinguishes users so two people with an identical
 *   shortlist don't see the same pick on the same day.
 * @param dateKey A calendar-day string, e.g. "2026-07-31" — pass the same
 *   value all day for a stable pick, and a new value the next day for a
 *   new one. Deliberately just a string, not a Date, so callers control
 *   the timezone the day boundary is computed in.
 *
 * Deliberately NOT an independent random/hash draw per day — that was the
 * original approach here, and it meant no memory of what was shown
 * recently: with an 8-candidate shortlist, drawing a fresh uniformly
 * random pick every day gives roughly a 60% chance of a repeat within any
 * 4-day window, which reads as broken even though each individual draw is
 * "random." Instead this derives one stable per-user shuffle of the
 * shortlist (seeded by userId + each candidate's own id, never the date,
 * so it doesn't reshuffle mid-cycle) and walks one position per calendar
 * day — every candidate is guaranteed to appear once before any repeat.
 * The cycle only changes when the candidate set itself does (this user's
 * ratings shift their top directors), which is exactly when a reshuffle
 * should happen anyway.
 */
export function pickDirectorOfDay<T extends { id: string }>(candidates: T[], userId: string, dateKey: string): T | null {
  if (candidates.length === 0) return null;
  const order = [...candidates].sort((a, b) => hashString(`${userId}:${a.id}`) - hashString(`${userId}:${b.id}`));
  const dayIndex = daysSinceEpoch(dateKey);
  return order[((dayIndex % order.length) + order.length) % order.length];
}
