// Kept separate from src/lib/actions/*.ts because a "use server" file may
// only export async functions — exporting these consts from there made
// Next.js treat the whole module as having no exports at build time.
export const PEOPLE_SEARCH_PAGE_SIZE = 20;

export const REVIEW_REACTIONS = ["agree", "disagree", "hot_take", "need_to_watch"] as const;
export type ReviewReaction = (typeof REVIEW_REACTIONS)[number];

export const REVIEW_REACTION_LABELS: Record<ReviewReaction, string> = {
  agree: "Agree",
  disagree: "Disagree",
  hot_take: "Hot take",
  need_to_watch: "Need to watch",
};
