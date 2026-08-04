import { Heart, MessageCircle, Repeat2 } from "lucide-react";
import Image from "@/components/ui/fade-image";
import { Avatar } from "@/components/ui/avatar";
import type { FakePost } from "@/lib/social/fake-posts";

function formatCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

export function PostCard({ post }: { post: FakePost }) {
  return (
    <article className="flex gap-3 border-b border-border px-4 py-4 sm:px-5">
      <Avatar name={post.author.name} size={44} className="mt-0.5 shrink-0" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
          <span className="font-medium text-foreground">{post.author.name}</span>
          <span className="text-foreground-muted">@{post.author.handle}</span>
          <span className="text-foreground-muted">· {post.timeAgo}</span>
        </div>

        <p className="mt-1 whitespace-pre-line text-[15px] leading-normal text-foreground">
          {post.body}
        </p>

        {post.photo && (
          <figure className="mt-3 overflow-hidden rounded-lg border border-border">
            <div className="relative aspect-[16/10] w-full bg-surface-raised">
              <Image
                src={post.photo.url}
                alt={post.photo.caption}
                fill
                sizes="(min-width: 640px) 560px, 100vw"
                className="object-cover"
              />
            </div>
            <figcaption className="border-t border-border bg-surface px-3 py-2 text-xs text-foreground-muted">
              {post.photo.caption}
            </figcaption>
          </figure>
        )}

        <div className="mt-3 flex max-w-sm items-center gap-6 text-foreground-muted">
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
      </div>
    </article>
  );
}
