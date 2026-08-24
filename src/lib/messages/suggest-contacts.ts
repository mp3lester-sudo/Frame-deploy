/**
 * Suggested contacts for the Messages inbox (personalization audit item
 * #6) -- pure merge/rank logic. Deliberately reuses relationship data
 * that's already sitting in the database rather than computing anything
 * fresh: compatibility_shares (migration 0083, populated whenever the
 * viewer has shared a TasteCompatibilityCard with someone) and
 * movie_night_participants (co-participants in a Movie Night the viewer
 * was part of). Both are cheap lookups -- no fresh compatibility scoring
 * or embedding math needed here, which is exactly why this was the
 * audit's "cheapest to build" item.
 *
 * Compatibility matches are the stronger signal (an explicit, scored
 * comparison the viewer chose to freeze and look at) so they fill the
 * suggestion list first; recent Movie Night co-participants -- a much
 * softer "you already did something social with this person" signal --
 * only fill remaining slots.
 */

export interface CompatibilityCandidate {
  userId: string;
  percent: number;
}

export interface MovieNightCandidate {
  userId: string;
  joinedAt: string;
}

export interface SuggestedContact {
  userId: string;
  reason: "compatibility" | "movie_night";
  /** Highest percent seen for this user (compatibility) or most recent
   *  joinedAt (movie_night) -- whichever produced the suggestion. */
  detail: number | string;
}

// A compatibility share below this is still a real comparison the viewer
// looked at, but not strong enough to actively nudge them toward
// messaging that person -- this list is meant to read as "people you'd
// probably enjoy talking to," not "everyone you've ever compared with."
const MIN_COMPATIBILITY_PERCENT = 70;

export const DEFAULT_SUGGESTED_CONTACTS_LIMIT = 5;

/**
 * Merges and ranks the two candidate pools into a single suggestion list.
 * `excludeUserIds` should already contain the viewer's own id and anyone
 * they already have a conversation with (or have blocked/been blocked
 * by) -- this function doesn't know about any of that, it just respects
 * whatever set it's given.
 */
export function buildSuggestedContacts(
  compatibilityCandidates: CompatibilityCandidate[],
  movieNightCandidates: MovieNightCandidate[],
  excludeUserIds: ReadonlySet<string>,
  limit: number = DEFAULT_SUGGESTED_CONTACTS_LIMIT
): SuggestedContact[] {
  // Dedupe compatibility candidates by user, keeping the highest percent
  // seen (a viewer may have shared more than one card with the same
  // person over time, e.g. before/after a big taste shift).
  const bestPercentByUser = new Map<string, number>();
  for (const c of compatibilityCandidates) {
    if (excludeUserIds.has(c.userId)) continue;
    const existing = bestPercentByUser.get(c.userId);
    if (existing === undefined || c.percent > existing) bestPercentByUser.set(c.userId, c.percent);
  }

  const compatibilitySuggestions: SuggestedContact[] = [...bestPercentByUser.entries()]
    .filter(([, percent]) => percent >= MIN_COMPATIBILITY_PERCENT)
    .sort((a, b) => b[1] - a[1])
    .map(([userId, percent]) => ({ userId, reason: "compatibility" as const, detail: percent }));

  const usedUserIds = new Set(compatibilitySuggestions.map((s) => s.userId));

  // Dedupe movie-night candidates by user, keeping the most recent
  // joinedAt (a viewer may have shared several nights with the same
  // person -- the most recent one is the more relevant "you two just did
  // something together" nudge).
  const latestJoinByUser = new Map<string, string>();
  for (const c of movieNightCandidates) {
    if (excludeUserIds.has(c.userId) || usedUserIds.has(c.userId)) continue;
    const existing = latestJoinByUser.get(c.userId);
    if (existing === undefined || c.joinedAt > existing) latestJoinByUser.set(c.userId, c.joinedAt);
  }

  const movieNightSuggestions: SuggestedContact[] = [...latestJoinByUser.entries()]
    .sort((a, b) => b[1].localeCompare(a[1]))
    .map(([userId, joinedAt]) => ({ userId, reason: "movie_night" as const, detail: joinedAt }));

  return [...compatibilitySuggestions, ...movieNightSuggestions].slice(0, limit);
}
