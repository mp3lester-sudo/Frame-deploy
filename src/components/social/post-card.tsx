import { Heart, MessageCircle, Repeat2 } from "lucide-react";
import Image from "@/components/ui/fade-image";
import { Avatar } from "@/components/ui/avatar";
import type { FakePost } from "@/lib/social/fake-posts";

function formatCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

function EngagementRow({ post }: { post: FakePost }) {
  return (
    <div className="flex max-w-sm items-center gap-6 text-foreground-muted">
      <span className="flex items-center gap-1.5 text-xs">
        <MessageCircle size={16} strokeWidth={1.75} />
        {formatCount(post.stats.comments)}
      </span>
      <span className="flex items-center gap-1.5 text-xs">
        <Repeat2 size={17} strokeWidth={1.75} />
        {formatCount(post.stats.reposts)}
      </span>
      <span className="flex items-center gap-1.5 text-xs">
        <Heart size={16} strokeWidth={1.75} />
        {formatCount(post.stats.likes)}
      </span>
    </div>
  );
}

/**
 * "Now showing" treatment -- replaces the old flat Twitter-style row.
 * Posts with a photo lead with a full-bleed hero image (the same still
 * or poster the app already pulls from TMDB), avatar/name/time overlaid
 * marquee-style at the top and the photo's caption overlaid at the
 * bottom, gradient-scrimmed for legibility. The full comment text lives
 * below the image at normal reading size rather than crammed into the
 * overlay -- captions are written short on purpose (see fake-posts.ts),
 * but a whole paragraph of commentary isn't, and overlaying that would
 * make it unreadable against a photo.
 *
 * Text-only posts (still the majority of the demo set) get a quieter
 * card -- same bento-card glass surface as everything else in the app
 * now, just without an image to lead with, since forcing a poster onto
 * a post that isn't about a specific still would misrepresent it.
 */
export function PostCard({ post }: { post: FakePost }) {
  if (post.photo) {
    return (
      <article className="bento-card overflow-hidden">
        <div className="relative aspect-[16/11] w-full bg-surface-raised">
          <Image
            src={post.photo.url}
            alt={post.photo.caption}
            fill
            sizes="(min-width: 640px) 560px, 100vw"
            className="object-cover"
          />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(0deg, rgba(10,9,8,0.9) 5%, rgba(10,9,8,0.05) 45%, rgba(10,9,8,0.35) 100%)",
            }}
          />
          <div className="absolute left-3 top-3 flex items-center gap-2">
            <Avatar name={post.author.name} size={26} />
            <span className="text-xs font-medium text-foreground drop-shadow">{post.author.name}</span>
            <span className="text-[11px] text-foreground-muted drop-shadow">&middot; {post.timeAgo}</span>
          </div>
          <p className="font-display absolute bottom-3 left-3 right-3 text-base italic leading-snug text-foreground drop-shadow">
            &ldquo;{post.photo.caption}&rdquo;
          </p>
        </div>

        <div className="p-4">
          <p className="whitespace-pre-line text-[15px] leading-normal text-foreground">{post.body}</p>
          <div className="mt-3">
            <EngagementRow post={post} />
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="bento-card flex gap-3 p-4">
      <Avatar name={post.author.name} size={40} className="mt-0.5 shrink-0" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
          <span className="font-medium text-foreground">{post.author.name}</span>
          <span className="text-foreground-muted">@{post.author.handle}</span>
          <span className="text-foreground-muted">&middot; {post.timeAgo}</span>
        </div>

        <p className="mt-1 whitespace-pre-line text-[15px] leading-normal text-foreground">{post.body}</p>

        <div className="mt-3">
          <EngagementRow post={post} />
        </div>
      </div>
    </article>
  );
}
