"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Heart, MessageCircle } from "lucide-react";
import { setReviewReaction } from "@/lib/actions/reactions";
import { useToast } from "@/components/ui/toast";
import type { SocialPost } from "@/lib/social/post";

function formatCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

/**
 * Launch-audit findings #4/#5: this row used to be three plain, non-
 * interactive <span>s -- Heart and comment count did nothing, and Repeat2
 * always showed a hardcoded 0 (no repost feature exists anywhere in the
 * app). Per "do not invent features," the fix isn't to build reposts --
 * it's to remove the fake affordance and make the two real ones actually
 * work:
 *   - Heart toggles the same "agree" reaction ReviewReactionBar already
 *     writes on the movie page, so a feed like and a movie-page reaction
 *     are the same underlying data, not two parallel like systems.
 *   - The comment count links straight to the review on its title page
 *     (/movie/[id]#reviews), where the real comment thread already lives --
 *     there's no standalone review page to build.
 */
export function PostEngagementRow({ post }: { post: SocialPost }) {
  const [likes, setLikes] = useState(post.stats.likes);
  const [myReaction, setMyReaction] = useState(post.myReaction);
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();

  function handleLike() {
    if (!post.canReact || isPending) return;
    const previousLikes = likes;
    const previousReaction = myReaction;
    const liking = myReaction !== "agree";

    setMyReaction(liking ? "agree" : null);
    setLikes((n) => n + (liking ? 1 : -1));

    startTransition(async () => {
      try {
        await setReviewReaction(post.id, liking ? "agree" : null);
      } catch {
        setLikes(previousLikes);
        setMyReaction(previousReaction);
        showToast("Couldn't save your reaction — try again");
      }
    });
  }

  const commentsHref = post.titleId ? `/movie/${post.titleId}#reviews` : null;

  return (
    <div className="flex max-w-sm items-center gap-6 text-foreground-muted">
      {commentsHref ? (
        <Link href={commentsHref} className="flex items-center gap-1.5 text-xs hover:text-foreground">
          <MessageCircle size={16} strokeWidth={1.75} />
          {formatCount(post.stats.comments)}
        </Link>
      ) : (
        <span className="flex items-center gap-1.5 text-xs">
          <MessageCircle size={16} strokeWidth={1.75} />
          {formatCount(post.stats.comments)}
        </span>
      )}
      <button
        type="button"
        disabled={!post.canReact || isPending}
        onClick={handleLike}
        aria-pressed={myReaction === "agree"}
        aria-label={myReaction === "agree" ? "Unlike" : "Like"}
        className="flex items-center gap-1.5 text-xs transition-colors disabled:cursor-default enabled:hover:text-accent"
      >
        <Heart
          size={16}
          strokeWidth={1.75}
          className={myReaction === "agree" ? "fill-accent text-accent" : undefined}
        />
        {formatCount(likes)}
      </button>
    </div>
  );
}
