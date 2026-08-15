/**
 * Creator Spotlight -- the Shows-mode analog of Director of the Day (see
 * src/lib/director-of-day/pick.ts, whose doc comment explains the daily-
 * rotation logic this reuses unchanged via pickDirectorOfDay). Movies
 * mode ranks by directors; TV has no director-equivalent credit (see
 * migration 0073 and ingest-tmdb.ts's own comments), so this ranks by
 * the 'creator' credit type (TMDB's created_by / showrunner field)
 * instead. Kept as a separate module rather than generalizing
 * director-of-day/pick.ts in place, since that module's doc comments and
 * naming are written specifically around "director" -- duplicating the
 * ~15-line ranking function here is cheaper than a rename that would
 * touch a feature this task didn't ask to change.
 */

export interface RatedTitleCreator {
  titleId: string;
  score: number;
}

export interface CreatorCandidate {
  id: string;
  name: string;
  score: number;
}

export function rankFavoriteCreators(
  ratings: RatedTitleCreator[],
  creatorByTitle: Map<string, { id: string; name: string }>
): CreatorCandidate[] {
  const byCreator = new Map<string, { name: string; score: number }>();

  for (const r of ratings) {
    const creator = creatorByTitle.get(r.titleId);
    if (!creator) continue;
    const weight = Math.max(r.score - 2.5, 0);
    if (weight <= 0) continue;
    const existing = byCreator.get(creator.id);
    byCreator.set(creator.id, {
      name: creator.name,
      score: (existing?.score ?? 0) + weight,
    });
  }

  return [...byCreator.entries()]
    .map(([id, v]) => ({ id, name: v.name, score: v.score }))
    .sort((a, b) => b.score - a.score);
}

export { pickDirectorOfDay as pickCreatorOfDay } from "@/lib/director-of-day/pick";
