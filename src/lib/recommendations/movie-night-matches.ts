export interface MovieNightVoteRecord {
  user_id: string;
  title_id: string;
  vote: "like" | "pass";
}

export interface MovieNightMatch {
  titleId: string;
  likedBy: string[];
}

/**
 * A "match" is a title every currently-active participant has liked, and
 * that nobody has passed on. Order matters for the second half of that
 * rule: a single pass anywhere permanently disqualifies a title (it's a
 * guaranteed miss for someone, same hard-cut philosophy as the genre
 * exclusion in movie-night.ts), even if everyone else already liked it.
 * A title nobody has voted on yet, or that's only partially liked, is
 * just "pending" -- not a match, but not dead either.
 *
 * participantIds is the CURRENT roster (movie_night_participants), not
 * just whoever has voted so far -- someone who hasn't reached a title in
 * their queue yet means it can't be a match yet, even if every vote cast
 * on it so far is a like.
 */
export function computeMatches(participantIds: string[], votes: MovieNightVoteRecord[]): MovieNightMatch[] {
  if (participantIds.length === 0) return [];
  const participantSet = new Set(participantIds);

  const likesByTitle = new Map<string, Set<string>>();
  const passedTitles = new Set<string>();

  for (const v of votes) {
    if (!participantSet.has(v.user_id)) continue; // stale vote from someone no longer in the group
    if (v.vote === "pass") {
      passedTitles.add(v.title_id);
      continue;
    }
    const likers = likesByTitle.get(v.title_id) ?? new Set<string>();
    likers.add(v.user_id);
    likesByTitle.set(v.title_id, likers);
  }

  const matches: MovieNightMatch[] = [];
  for (const [titleId, likers] of likesByTitle) {
    if (passedTitles.has(titleId)) continue;
    if (likers.size !== participantIds.length) continue;
    // every participant liked it -- confirm no participant is missing
    let all = true;
    for (const id of participantIds) {
      if (!likers.has(id)) {
        all = false;
        break;
      }
    }
    if (all) matches.push({ titleId, likedBy: [...likers] });
  }
  return matches;
}

/**
 * Fallback ranking for when a group's queue runs dry with no unanimous
 * match -- ranks whatever got voted on by how many people liked it (most
 * agreement first), excluding anything anyone passed on (still a hard
 * cut -- the whole point of the fairness rule elsewhere in this feature
 * is never handing the group a pick that's a guaranteed miss for one
 * person just because the host is out of patience).
 */
export function rankByLikeCount(votes: MovieNightVoteRecord[]): { titleId: string; likeCount: number }[] {
  const likesByTitle = new Map<string, number>();
  const passedTitles = new Set<string>();

  for (const v of votes) {
    if (v.vote === "pass") {
      passedTitles.add(v.title_id);
      continue;
    }
    likesByTitle.set(v.title_id, (likesByTitle.get(v.title_id) ?? 0) + 1);
  }

  return [...likesByTitle.entries()]
    .filter(([titleId]) => !passedTitles.has(titleId))
    .map(([titleId, likeCount]) => ({ titleId, likeCount }))
    .sort((a, b) => b.likeCount - a.likeCount);
}
