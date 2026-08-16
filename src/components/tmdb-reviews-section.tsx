import { Avatar } from "@/components/ui/avatar";
import { RatingStars } from "@/components/ui/rating-stars";
import { formatDistanceToNow } from "@/lib/date";
import type { TmdbReview } from "@/lib/external/tmdb-reviews";

/**
 * Horizontal press-strip layout (design round 4, concept 3): a swipeable
 * row of review cards rather than a long vertical list, so the section
 * doesn't dominate the page. TMDB's author rating comes back on a 0-10
 * scale, but every other rating surface in the app reads out of 5 stars,
 * so it's halved and rendered through the existing RatingStars component
 * instead of a raw "/10" number.
 */
export function TmdbReviewsSection({ reviews }: { reviews: TmdbReview[] }) {
  if (!reviews.length) return null;

  return (
    <section className="mt-10">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Critic &amp; Community Reviews</h2>
        <span className="text-xs text-foreground-muted">via TMDB</span>
      </div>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {reviews.slice(0, 8).map((r) => (
          <div
            key={r.id}
            className="flex w-60 shrink-0 flex-col rounded-[var(--radius-md)] border border-border bg-surface-raised p-4"
          >
            <div className="mb-2 flex items-center gap-2">
              <Avatar name={r.author} src={r.avatarUrl} size={24} />
              <p className="min-w-0 flex-1 truncate text-xs font-semibold">{r.author}</p>
              {r.rating != null && (
                <RatingStars value={Math.round((r.rating / 2) * 2) / 2} size={11} />
              )}
            </div>
            <p className="line-clamp-5 flex-1 text-xs leading-relaxed text-foreground-muted">{r.content}</p>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[10px] text-foreground-muted">{formatDistanceToNow(r.createdAt)}</span>
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-medium uppercase tracking-wide text-accent hover:underline"
              >
                Read on TMDB
              </a>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
