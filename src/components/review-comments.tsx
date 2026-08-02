"use client";

import { useState, useTransition } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { addComment, deleteComment, type NewComment } from "@/lib/actions/comments";
import { validateCommentBody } from "@/lib/comments/validate";
import { formatDistanceToNow } from "@/lib/date";
import { ReportButton } from "@/components/moderation/report-button";

export interface DisplayComment {
  id: string;
  userId: string;
  username: string;
  avatarUrl: string | null;
  body: string;
  createdAt: string;
}

export function ReviewComments({
  reviewId,
  initialComments,
  viewerId,
  canComment,
}: {
  reviewId: string;
  initialComments: DisplayComment[];
  viewerId: string | null;
  canComment: boolean;
}) {
  const [comments, setComments] = useState(initialComments);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(initialComments.length > 0 && initialComments.length <= 3);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validation = validateCommentBody(draft);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    setError(null);

    startTransition(async () => {
      try {
        const comment: NewComment = await addComment(reviewId, validation.body);
        setComments((prev) => [
          ...prev,
          {
            id: comment.id,
            userId: comment.user_id,
            username: comment.username,
            avatarUrl: comment.avatar_url,
            body: comment.body,
            createdAt: comment.created_at,
          },
        ]);
        setDraft("");
        setExpanded(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add comment");
      }
    });
  }

  function handleDelete(commentId: string) {
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    startTransition(async () => {
      await deleteComment(commentId);
    });
  }

  return (
    <div className="mt-3">
      {comments.length > 0 && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-xs text-foreground-muted hover:text-foreground"
        >
          {comments.length} comment{comments.length === 1 ? "" : "s"}
        </button>
      )}

      {expanded && comments.length > 0 && (
        <div className="mt-2 flex flex-col gap-2 border-l border-border pl-3">
          {comments.map((c) => (
            <div key={c.id} className="flex items-start gap-2">
              <Avatar name={c.username} src={c.avatarUrl} size={20} />
              <div className="min-w-0 flex-1">
                <p className="text-xs">
                  <span className="font-medium">{c.username}</span>{" "}
                  <span className="text-foreground-muted">{formatDistanceToNow(c.createdAt)}</span>
                </p>
                <p className="text-sm leading-snug">{c.body}</p>
              </div>
              {viewerId === c.userId && (
                <button
                  type="button"
                  onClick={() => handleDelete(c.id)}
                  className="text-xs text-foreground-muted hover:text-danger"
                  aria-label="Delete comment"
                >
                  Delete
                </button>
              )}
              {viewerId && viewerId !== c.userId && <ReportButton contentType="review_comment" contentId={c.id} />}
            </div>
          ))}
        </div>
      )}

      {canComment && (
        <form onSubmit={handleSubmit} className="mt-2 flex items-start gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a comment…"
            className="flex-1 rounded-[var(--radius-sm)] border border-border bg-surface-raised px-2 py-1 text-sm placeholder:text-foreground-muted/60 focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <Button type="submit" size="sm" variant="secondary" isLoading={isPending} disabled={!draft.trim()}>
            Reply
          </Button>
        </form>
      )}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
