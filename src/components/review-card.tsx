import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { RatingStars } from "@/components/ui/rating-stars";
import { ReviewReactionBar } from "@/components/review-reaction-bar";
import { ReviewComments, type DisplayComment } from "@/components/review-comments";
import { DeleteReviewButton } from "@/components/delete-review-button";
import { ReportButton } from "@/components/moderation/report-button";
import { formatDistanceToNow } from "@/lib/date";
import { emptyReactionSummary } from "@/lib/reactions/aggregate";
import type { ReactionSummary } from "@/lib/reactions/aggregate";

export function ReviewCard({
  reviewId,
  authorId,
  authorName,
  authorUsername,
  authorAvatarUrl,
  rating,
  body,
  containsSpoilers,
  createdAt,
  reactions,
  canReact,
  comments = [],
  viewerId,
  showComments = true,
}: {
  reviewId: string;
  /** Compared against viewerId to decide whether the "Delete" affordance
   *  shows — undo for an accidental/regretted review. Optional so existing
   *  call sites that haven't been updated yet don't break; the delete
   *  option simply won't render for them. */
  authorId?: string | null;
  authorName: string;
  /** Used to link the avatar/name to /profile/[username] -- optional so
   *  existing call sites that only had a display string don't break, but
   *  every real call site should pass this now that all of them have the
   *  username available from their own profile query. */
  authorUsername?: string | null;
  authorAvatarUrl?: string | null;
  rating?: number | null;
  body: string;
  containsSpoilers: boolean;
  createdAt: string;
  reactions?: ReactionSummary;
  canReact: boolean;
  comments?: DisplayComment[];
  viewerId: string | null;
  /** Shows the full comment thread by default; set false on dense multi-review feeds (e.g. Hot Takes) to keep them scannable — full discussion is still one click away on the movie page. */
  showComments?: boolean;
}) {
  const isOwnReview = !!viewerId && !!authorId && viewerId === authorId;
  const { counts, myReaction } = reactions ?? emptyReactionSummary();
  return (
    <div className="border-b border-border py-4 last:border-0">
      <div className="mb-2 flex items-center gap-3">
        {authorUsername ? (
          <Link href={`/profile/${authorUsername}`} className="flex items-center gap-3 hover:opacity-80">
            <Avatar name={authorName} src={authorAvatarUrl} size={32} />
            <div>
              <p className="text-sm font-medium">{authorName}</p>
              <p className="text-xs text-foreground-muted">{formatDistanceToNow(createdAt)}</p>
            </div>
          </Link>
        ) : (
          <>
            <Avatar name={authorName} src={authorAvatarUrl} size={32} />
            <div>
              <p className="text-sm font-medium">{authorName}</p>
              <p className="text-xs text-foreground-muted">{formatDistanceToNow(createdAt)}</p>
            </div>
          </>
        )}
        {typeof rating === "number" && <RatingStars value={rating} size={14} className="ml-auto" />}
      </div>
      {containsSpoilers ? (
        <details>
          <summary className="cursor-pointer text-sm text-foreground-muted">
            Contains spoilers — click to reveal
          </summary>
          <p className="mt-2 text-sm leading-relaxed">{body}</p>
        </details>
      ) : (
        <p className="text-sm leading-relaxed">{body}</p>
      )}
      <div className="mt-2 flex items-center justify-end gap-3">
        {!isOwnReview && viewerId && <ReportButton contentType="review" contentId={reviewId} />}
        {isOwnReview && <DeleteReviewButton reviewId={reviewId} />}
      </div>
      <ReviewReactionBar reviewId={reviewId} initialCounts={counts} initialMyReaction={myReaction} canReact={canReact} />
      {showComments && (
        <ReviewComments reviewId={reviewId} initialComments={comments} viewerId={viewerId} canComment={canReact} />
      )}
    </div>
  );
}
