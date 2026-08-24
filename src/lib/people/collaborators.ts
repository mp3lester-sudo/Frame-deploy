/**
 * "Frequently works with" -- discovery-depth-audit rendition #3. The
 * person page's filmography already links every title correctly (task
 * #83), but there was no path from one person to another -- the audit's
 * finding was that a curious detour ("who else was in this") required
 * going back to the movie page and clicking a different name one at a
 * time. This turns the filmography into a browsable web of people
 * instead of a flat list.
 *
 * Computed from title_credits co-occurrence alone (same titles, different
 * person) -- no new external data, no TMDB calls. Pure function here so
 * the "who counts as a frequent collaborator" decision is unit-testable
 * without a database, same split as favorite-director-alerts.ts.
 */

export interface CollaboratorCredit {
  titleId: string;
  personId: string;
  personName: string;
  photoUrl: string | null;
}

export interface FrequentCollaborator {
  personId: string;
  personName: string;
  photoUrl: string | null;
  sharedTitleCount: number;
}

// A single shared title isn't "frequently" anything -- two people who
// happened to both be in one movie together isn't a pattern worth
// surfacing. This is the same "don't fake it" bar the rest of this
// build order uses (see favorite-director-alerts.ts): a real, repeated
// collaboration, not a coincidence dressed up as one.
export const MIN_SHARED_TITLES = 2;

export const DEFAULT_COLLABORATOR_LIMIT = 8;

/**
 * Pure: given every credit row across this person's own filmography's
 * titles (i.e. "everyone else credited on anything this person worked
 * on"), tally how many distinct titles each other person shares with
 * `currentPersonId`, drop anyone under MIN_SHARED_TITLES, and rank the
 * rest by shared-title count (ties broken alphabetically for a stable,
 * deterministic order).
 */
export function computeFrequentCollaborators(
  credits: CollaboratorCredit[],
  currentPersonId: string,
  limit: number = DEFAULT_COLLABORATOR_LIMIT
): FrequentCollaborator[] {
  const titleIdsByPerson = new Map<string, Set<string>>();
  const infoByPerson = new Map<string, { name: string; photoUrl: string | null }>();

  for (const credit of credits) {
    if (credit.personId === currentPersonId) continue;
    const titleIds = titleIdsByPerson.get(credit.personId) ?? new Set<string>();
    titleIds.add(credit.titleId);
    titleIdsByPerson.set(credit.personId, titleIds);
    // First name/photo seen for a person wins -- title_credits can carry
    // the same person multiple times per title (e.g. writer + director),
    // so later rows for the same person shouldn't overwrite this with
    // identical data anyway.
    if (!infoByPerson.has(credit.personId)) {
      infoByPerson.set(credit.personId, { name: credit.personName, photoUrl: credit.photoUrl });
    }
  }

  const ranked = [...titleIdsByPerson.entries()]
    .map(([personId, titleIds]) => {
      const info = infoByPerson.get(personId)!;
      return {
        personId,
        personName: info.name,
        photoUrl: info.photoUrl,
        sharedTitleCount: titleIds.size,
      };
    })
    .filter((c) => c.sharedTitleCount >= MIN_SHARED_TITLES)
    .sort((a, b) => b.sharedTitleCount - a.sharedTitleCount || a.personName.localeCompare(b.personName));

  return ranked.slice(0, limit);
}
