import Link from "next/link";
import Image from "@/components/ui/fade-image";
import { Avatar } from "@/components/ui/avatar";
import type { SocialPost } from "@/lib/social/post";
import { PostEngagementRow } from "@/components/social/post-engagement-row";

/**
 * "Now showing" treatment -- replaces the old flat Twitter-style row.
 * Posts with a photo lead with a hero image (a real poster from the title
 * the review is about), avatar/name/time overlaid marquee-style at the
 * top and a caption overlaid at the bottom, gradient-scrimmed for
 * legibility. The full review text lives below the image at normal
 * reading size rather than crammed into the overlay.
 *
 * The hero's aspect ratio follows the photo's real orientation instead of
 * a single fixed landscape frame. Posters run ~2:3 portrait -- force-
 * cropping those into a 16:11 landscape frame chopped out the vast
 * majority of the image, leaving a meaningless sliver of typography or a
 * random slice of a face. A 3:4 frame keeps almost the entire poster in
 * view and also happens to be how someone photographing a poster or a
 * physical disc case on their shelf would actually frame it. "still"
 * posts (a genuinely landscape backdrop) keep the original 16:11.
 *
 * Text-only posts (reviews with no poster on file) get a quieter card --
 * same bento-card glass surface as everything else in the app now, just
 * without an image to lead with.
 *
 * Avatar and author name link to /profile/[username], matching the
 * sitewide "avatars/names are clickable" convention (see ReviewCard).
 *
 * Launch-audit finding #5: posts had no way to reach the title being
 * reviewed. The photo branch's caption doubles as that link (it already
 * shows the title name); the text-only branch gets a small "On <Title>"
 * line matching Hot Takes' pinned title-link convention.
 */
export function PostCard({ post }: { post: SocialPost }) {
  if (post.photo) {
    const heroAspect = post.photo.orientation === "poster" ? "aspect-[3/4]" : "aspect-[16/11]";
    return (
      <article className="bento-card overflow-hidden">
        <div className={`relative w-full bg-surface-raised ${heroAspect}`}>
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
          <Link
            href={`/profile/${post.authorUsername}`}
            className="absolute left-3 top-3 flex items-center gap-2 hover:opacity-80"
          >
            <Avatar name={post.authorName} src={post.avatarUrl} size={26} />
            <span className="text-xs font-medium text-foreground drop-shadow">{post.authorName}</span>
            <span className="text-[11px] text-foreground-muted drop-shadow">&middot; {post.timeAgo}</span>
          </Link>
          {post.titleId ? (
            <Link
              href={`/movie/${post.titleId}`}
              className="font-display absolute bottom-3 left-3 right-3 text-base italic leading-snug text-foreground drop-shadow hover:underline"
            >
              &ldquo;{post.photo.caption}&rdquo;
            </Link>
          ) : (
            <p className="font-display absolute bottom-3 left-3 right-3 text-base italic leading-snug text-foreground drop-shadow">
              &ldquo;{post.photo.caption}&rdquo;
            </p>
          )}
        </div>

        <div className="p-3">
          <p className="whitespace-pre-line text-[15px] leading-normal text-foreground">{post.body}</p>
          <div className="mt-3">
            <PostEngagementRow post={post} />
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="bento-card flex gap-3 p-3">
      <Link href={`/profile/${post.authorUsername}`} className="mt-0.5 shrink-0 hover:opacity-80">
        <Avatar name={post.authorName} src={post.avatarUrl} size={40} />
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
          <Link href={`/profile/${post.authorUsername}`} className="font-medium text-foreground hover:underline">
            {post.authorName}
          </Link>
          <span className="text-foreground-muted">@{post.authorUsername}</span>
          <span className="text-foreground-muted">&middot; {post.timeAgo}</span>
        </div>

        {post.titleId && post.titleName && (
          <Link
            href={`/movie/${post.titleId}`}
            className="mt-1 inline-block text-xs font-medium uppercase tracking-wider text-accent hover:underline"
          >
            On {post.titleName}
          </Link>
        )}

        <p className="mt-1 whitespace-pre-line text-[15px] leading-normal text-foreground">{post.body}</p>

        <div className="mt-3">
          <PostEngagementRow post={post} />
        </div>
      </div>
    </article>
  );
}
