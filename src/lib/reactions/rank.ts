import { REVIEW_REACTIONS, type ReviewReaction } from "@/lib/constants/social";
import type { ReactionRow } from "./aggregate";

export interface ControversyScore {
  reviewId: string;
  counts: Record<ReviewReaction, number>;
  /** hot_take + disagree — the two reaction types that signal "this take got people going", as opposed to agree/need_to_watch which don't. */
  score: number;
}

function isReviewReaction(value: string): value is ReviewReaction {
  return (REVIEW_REACTIONS as readonly string[]).includes(value);
}

/**
 * Ranks a set of reviews by how "hot" their reactions are, for the Hot
 * Takes discovery feed. Only reviews with a nonzero score are returned
 * (a review nobody reacted to isn't a hot take, it's just unremarked-on),
 * sorted highest-score first with ties broken by the order reviewIds was
 * given in (callers pass reviewIds already sorted newest-first, so ties
 * land on the more recent review).
 */
export function rankByControversy(reviewIds: string[], reactionRows: ReactionRow[]): ControversyScore[] {
  const counts = new Map<string, Record<ReviewReaction, number>>();
  for (const id of reviewIds) {
    counts.set(id, { agree: 0, disagree: 0, hot_take: 0, need_to_watch: 0 });
  }

  for (const row of reactionRows) {
    if (!isReviewReaction(row.reaction)) continue;
    const c = counts.get(row.review_id);
    if (!c) continue; // reaction on a review outside the id set we were given
    c[row.reaction]++;
  }

  return reviewIds
    .map((reviewId) => {
      const c = counts.get(reviewId)!;
      return { reviewId, counts: c, score: c.hot_take + c.disagree };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}
