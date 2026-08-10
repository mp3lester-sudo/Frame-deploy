/**
 * How much of the "collaborative" blend weight (see curation-confidence.ts,
 * computeBlendWeights) goes to real behavioral co-rating overlap
 * (behavioral_collaborative_recs, migration 0056) versus the existing
 * embedding-neighbor signal (similar_users_liked, migrations 0003/0021/0022).
 *
 * The two signals answer genuinely different questions. similar_users_liked
 * finds "neighbors" by taste-vector embedding proximity -- users whose
 * favorite titles are semantically/thematically close to yours -- and is
 * mediated entirely through content embeddings. behavioral_collaborative_recs
 * finds neighbors purely from the ratings matrix: other users who rated the
 * SAME titles you rated highly, with no embeddings involved at all. That's
 * what lets it catch the classic collaborative-filtering win a content
 * model structurally can't see -- "fans of the exact things you loved also
 * loved this" even when that other title has zero thematic resemblance to
 * anything in your taste vector.
 *
 * Behavioral overlap is sparse early on -- it only fires once enough other
 * users have rated the same titles this user has (see p_min_shared_likes in
 * the RPC). Rather than give it a fixed weight that would sit at
 * zero-effective-signal for most users pre-launch, the split is dynamic:
 * full weight stays on the embedding-neighbor signal when there's no
 * behavioral overlap yet, and only splits once there's real behavioral
 * signal to blend in -- so the new signal only pulls weight away from the
 * existing crowd signal when it actually has something to say.
 */
const BEHAVIORAL_SHARE_WHEN_PRESENT = 0.5;

export interface CollaborativeSplit {
  embeddingShare: number;
  behavioralShare: number;
}

export function computeCollaborativeSplit(hasBehavioralSignal: boolean): CollaborativeSplit {
  const behavioralShare = hasBehavioralSignal ? BEHAVIORAL_SHARE_WHEN_PRESENT : 0;
  return { embeddingShare: 1 - behavioralShare, behavioralShare };
}
