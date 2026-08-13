"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { postToClub, type NewClubPost } from "@/lib/actions/clubs";
import { validateClubPostBody } from "@/lib/clubs/validate";
import { formatDistanceToNow } from "@/lib/date";

export interface ClubPost {
  id: string;
  userId: string;
  username: string;
  avatarUrl: string | null;
  body: string;
  createdAt: string;
}

export function ClubFeed({
  clubId,
  initialPosts,
  canPost,
}: {
  clubId: string;
  initialPosts: ClubPost[];
  canPost: boolean;
}) {
  const [posts, setPosts] = useState(initialPosts);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validation = validateClubPostBody(draft);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const post: NewClubPost = await postToClub(clubId, validation.value);
        setPosts((prev) => [
          { id: post.id, userId: post.user_id, username: post.username, avatarUrl: post.avatar_url, body: post.body, createdAt: post.created_at },
          ...prev,
        ]);
        setDraft("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to post");
      }
    });
  }

  return (
    <div>
      {canPost && (
        <form onSubmit={handleSubmit} className="mb-4 flex items-start gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Share something with the club…"
            rows={2}
            className="flex-1 resize-y rounded-[var(--radius-md)] border border-border bg-surface-raised px-3 py-2 text-sm placeholder:text-foreground-muted/60 focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <Button type="submit" size="sm" variant="secondary" isLoading={isPending} disabled={!draft.trim()}>
            Post
          </Button>
        </form>
      )}
      {error && <p className="mb-3 text-xs text-danger">{error}</p>}

      {posts.length === 0 ? (
        <p className="text-sm text-foreground-muted">No posts yet — be the first to say something.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {posts.map((p) => (
            // Bento-card wrap for consistency with the rest of the app --
            // this used to be a bare flex row with no surface at all, the
            // one remaining "plain" pattern on the club page.
            <div key={p.id} className="bento-card flex items-start gap-3 p-3">
              <Link href={`/profile/${p.username}`} className="shrink-0 hover:opacity-80">
                <Avatar name={p.username} src={p.avatarUrl} size={32} />
              </Link>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <Link href={`/profile/${p.username}`} className="font-medium hover:text-accent">
                    {p.username}
                  </Link>{" "}
                  <span className="text-xs text-foreground-muted">{formatDistanceToNow(p.createdAt)}</span>
                </p>
                <p className="mt-0.5 text-sm leading-relaxed">{p.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
