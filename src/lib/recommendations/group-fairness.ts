/**
 * Group-consensus aggregation for Movie Night. Plain averaging of raw
 * content-similarity scores (the previous approach) doesn't actually find a
 * "happy medium": if one person's taste vector runs hot (systematically
 * higher cosine similarities across the board) their preferences can
 * quietly dominate a sum/average even though the math looks even-handed,
 * leaving someone else with a pick that's a genuine miss for them.
 *
 * This instead: (1) normalizes each participant's scores relative to their
 * own range within the shared candidate pool, so raw-magnitude differences
 * between people never matter — only where a title falls in THEIR OWN
 * preference range; (2) applies a hard floor (per product decision: nobody
 * should see a pick that's a clear miss for them, even if the group average
 * looks great), relaxed in steps only if genuinely nothing clears it, so a
 * very divergent-taste group still gets a real answer instead of an empty
 * list.
 */
export interface ParticipantScores {
  userId: string;
  /** title_id -> raw cosine similarity, for exactly the shared candidate
   *  pool (see title_similarity_for_user, migration 0023). An empty map
   *  means this participant has no taste vector yet (nothing rated) —
   *  they're excluded from the fairness calculation entirely rather than
   *  vetoing every candidate on missing data. */
  scores: Map<string, number>;
}

export interface GroupCandidateScore {
  titleId: string;
  averageNormalized: number;
  perParticipant: { userId: string; normalized: number }[];
  passesFloor: boolean;
}

/** Min-max normalizes one participant's scores into their own [0, 1] range.
 *  A participant whose scores are all identical (or who has just one) maps
 *  everything to 1 — there's no relative preference signal to penalize
 *  anything against. */
export function normalizeParticipantScores(scores: Map<string, number>): Map<string, number> {
  const values = [...scores.values()];
  if (values.length === 0) return new Map();
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max - min < 1e-9) {
    return new Map([...scores.keys()].map((id) => [id, 1]));
  }
  return new Map([...scores.entries()].map(([id, v]) => [id, (v - min) / (max - min)]));
}

const DEFAULT_FLOOR = 0.35;

/**
 * Scores every title present in ALL active (has-a-taste-vector) participants'
 * shared pool. A title missing from any active participant's score map is
 * dropped entirely — that ambiguity (never scored vs. genuinely scored low)
 * is exactly what a hard fairness floor can't tolerate silently guessing at.
 */
export function aggregateGroupScores(
  participants: ParticipantScores[],
  { floor = DEFAULT_FLOOR }: { floor?: number } = {}
): GroupCandidateScore[] {
  const active = participants.filter((p) => p.scores.size > 0);
  if (active.length === 0) return [];

  const normalizedByParticipant = active.map((p) => ({
    userId: p.userId,
    normalized: normalizeParticipantScores(p.scores),
  }));

  const allTitleIds = new Set<string>();
  for (const p of active) for (const id of p.scores.keys()) allTitleIds.add(id);

  const results: GroupCandidateScore[] = [];
  for (const titleId of allTitleIds) {
    const perParticipant = normalizedByParticipant
      .filter((p) => p.normalized.has(titleId))
      .map((p) => ({ userId: p.userId, normalized: p.normalized.get(titleId)! }));

    if (perParticipant.length !== active.length) continue; // not scored for someone active — not a fair candidate

    const averageNormalized = perParticipant.reduce((sum, p) => sum + p.normalized, 0) / perParticipant.length;
    const passesFloor = perParticipant.every((p) => p.normalized >= floor);

    results.push({ titleId, averageNormalized, perParticipant, passesFloor });
  }

  return results.sort((a, b) => b.averageNormalized - a.averageNormalized);
}

/** Floor relaxation steps, tried in order until something clears — the last
 *  step (0) always passes everything (normalized scores are always >= 0),
 *  so a real group with any scored candidates always gets a result. */
const FLOOR_RELAXATION_STEPS = [0.35, 0.2, 0.1, 0];

export function rankGroupCandidates(participants: ParticipantScores[]): GroupCandidateScore[] {
  for (const floor of FLOOR_RELAXATION_STEPS) {
    const passing = aggregateGroupScores(participants, { floor }).filter((s) => s.passesFloor);
    if (passing.length > 0) return passing;
  }
  return [];
}

const HIGH_CONSENSUS_THRESHOLD = 0.65;

/** Short, honest line explaining the group fit — never fabricates a named
 *  taste trait per person (no per-person genre-affinity data feeds this),
 *  just names who a pick leans toward when it isn't a strong match for
 *  everyone equally. */
export function buildGroupConsensusNote(
  candidate: GroupCandidateScore,
  participantNames: Map<string, string>
): string {
  if (candidate.perParticipant.length <= 1) {
    return "A strong match based on what's rated so far.";
  }
  if (candidate.perParticipant.every((p) => p.normalized >= HIGH_CONSENSUS_THRESHOLD)) {
    return "A strong match for everyone in the group.";
  }
  const sorted = [...candidate.perParticipant].sort((a, b) => b.normalized - a.normalized);
  const topName = participantNames.get(sorted[0].userId) ?? "one of you";
  return `Leans toward ${topName}'s taste, but still clears the bar for everyone.`;
}

export interface ParticipantCitation {
  userId: string;
  /** Up to 2, closest-first (see most_similar_liked_title, migration
   *  0016/0032) -- this participant's own highly-rated titles closest to
   *  the candidate. Empty when nothing cleared the citation bar for them
   *  on this particular candidate -- never fabricated. */
  citedTitles: string[];
}

/**
 * Names the SPECIFIC titles from each person's own rating history driving
 * a group pick -- "Because you both loved Se7en" or "Michael loved Lost
 * Highway; Eli loved Zodiac" -- instead of buildGroupConsensusNote's
 * generic "strong match for everyone" / "leans toward X" lines. Same
 * "user curation is the key" specificity the solo home page already has
 * (see explain.ts's citedTitles). Falls back to buildGroupConsensusNote
 * whenever nobody in the group has a close-enough citation for this
 * candidate, so a real film is never named unless it's genuinely there.
 */
export function buildGroupConsensusHeadline(
  candidate: GroupCandidateScore,
  participantNames: Map<string, string>,
  citations: ParticipantCitation[]
): string {
  const citedByUser = new Map(
    citations.filter((c) => c.citedTitles.length > 0).map((c) => [c.userId, c.citedTitles])
  );
  if (citedByUser.size === 0) return buildGroupConsensusNote(candidate, participantNames);

  // A "movie night" of one (or the rare group candidate with only one
  // active participant) -- same phrasing the solo engine uses.
  if (candidate.perParticipant.length <= 1) {
    const titles = [...citedByUser.values()][0];
    return titles.length > 1
      ? `Because you loved ${titles[0]} and ${titles[1]}.`
      : `Because you loved ${titles[0]}.`;
  }

  // A title every citing participant loved in common is the strongest
  // possible signal a compromise pick can have -- surfaced even if not
  // literally every participant has a citation (someone with too little
  // rating history yet still benefits from seeing why it clicked for the
  // others).
  const citationLists = [...citedByUser.values()];
  const sharedTitle = citationLists[0]?.find((t) => citationLists.every((list) => list.includes(t)));
  if (sharedTitle && citedByUser.size >= 2) {
    const subject = citedByUser.size > 2 ? "everyone" : "you both";
    return `Because ${subject} loved ${sharedTitle}.`;
  }

  // Different people, different titles -- name each person's own closest
  // match rather than picking one arbitrarily.
  const perPersonLines = candidate.perParticipant
    .map((p) => {
      const titles = citedByUser.get(p.userId);
      if (!titles?.length) return null;
      const name = participantNames.get(p.userId) ?? "someone";
      return `${name} loved ${titles[0]}`;
    })
    .filter((line): line is string => !!line);

  if (perPersonLines.length >= 2) return `${perPersonLines.join("; ")}.`;

  if (perPersonLines.length === 1) {
    // Only one person has a citation -- fold in the existing "leans
    // toward"/"strong match" framing so it's still clear how the rest of
    // the group fits, rather than implying unanimous enthusiasm.
    const consensus = buildGroupConsensusNote(candidate, participantNames);
    return `${perPersonLines[0]} — ${consensus.charAt(0).toLowerCase()}${consensus.slice(1)}`;
  }

  return buildGroupConsensusNote(candidate, participantNames);
}
