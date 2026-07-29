/**
 * Fills a season's day slots from priority-ordered candidate ID lists —
 * e.g. [tasteRankedThemeEligibleIds, popularityRankedThemeEligibleIds] —
 * taking from the first list before falling back to the next, deduping
 * throughout so no title is assigned twice. Pure: the actual ranking
 * (taste similarity, popularity) and theme filtering happen before this,
 * in generate-picks.ts.
 */
export function selectPicks(orderedCandidateIdLists: string[][], dayCount: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const list of orderedCandidateIdLists) {
    for (const id of list) {
      if (result.length >= dayCount) return result;
      if (seen.has(id)) continue;
      seen.add(id);
      result.push(id);
    }
  }

  return result;
}
