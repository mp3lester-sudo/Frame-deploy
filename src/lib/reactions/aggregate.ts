import { REVIEW_REACTIONS, type ReviewReaction } from "@/lib/constants/social";

export interface ReactionRow {
  review_id: string;
  reaction: string;
  user_id: string;
}

export interface ReactionSummary {
  counts: Record<ReviewReaction, number>;
  myReaction: ReviewReaction | null;
}

function emptyCounts(): Record<ReviewReaction, number> {
  return Object.fromEntries(REVIEW_REACTIONS.map((r) => [r, 0])) as Record<ReviewReaction, number>;
}

function isReviewReaction(value: string): value is ReviewReaction {
  return (REVIEW_REACTIONS as readonly string[]).includes(value);
}

/**
 * Groups a flat list of review_reactions rows (as fetched in one query for
 * every review on a page) into a per-review summary: how many of each
 * reaction, and which one (if any) the current viewer picked. Pulled out of
 * the page component so it's unit-testable without a Supabase round trip.
 */
export function aggregateReactions(rows: ReactionRow[], viewerId: string | null): Map<string, ReactionSummary> {
  const byReview = new Map<string, ReactionSummary>();

  for (const row of rows) {
    if (!isReviewReaction(row.reaction)) continue; // ignore anything not in the current set, just in case

    let summary = byReview.get(row.review_id);
    if (!summary) {
      summary = { counts: emptyCounts(), myReaction: null };
      byReview.set(row.review_id, summary);
    }

    summary.counts[row.reaction]++;
    if (viewerId && row.user_id === viewerId) summary.myReaction = row.reaction;
  }

  return byReview;
}

export function emptyReactionSummary(): ReactionSummary {
  return { counts: emptyCounts(), myReaction: null };
}
