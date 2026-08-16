import { Avatar } from "@/components/ui/avatar";
import { RatingStars } from "@/components/ui/rating-stars";
import { formatDistanceToNow } from "@/lib/date";
import type { TmdbReview } from "@/lib/external/tmdb-reviews";

/**
 * Split layout (design round 4, concept 4): an aggregate rating ring/stars
 * on the left, individual reviews on the right. TMDB's author_details.rating
 * comes back on a 0-10 scale (matches the site's own /10 "Your rating"
 * copy elsewhere), but everywhere else in the app star ratings read out of
 * 5 -- so both the aggregate and each review's rating are halved here
 * rather than showing a raw /10 number.
 */
export function TmdbReviewsSection({ reviews }: { reviews: TmdbReview[] }) {
  if (!reviews.length) return null;

  const rated = reviews.filter((r) => r.rating != null) as (TmdbReview & { rating: number })[];
  const avgOutOf5 = rated.length
    ? Math.round((rated.reduce((sum, r) => sum + r.rating, 0) / rated.length / 2) * 2) / 2
    : null;

  return (
    <section className="mt-10">
      <h2 className="mb-4 text-lg font-semibold">Critic &amp; Community Reviews</h2>
      <div className="grid grid-cols-[110px_1fr] gap-6">
        <div className="flex flex-col items-center pt-1 text-center">
          <span className="font-display text-4xl leading-none text-accent-soft">
            {avgOutOf5 != null ? avgOutOf5.toFixed(1) : "—"}
          </span>
          {avgOutOf5 != null && <RatingStars value={avgOutOf5} size={14} className="mt-2" />}
          <span className="mt-2 text-[10px] uppercase tracking-wide text-foreground-muted">
            {reviews.length} {reviews.length === 1 ? "review" : "reviews"} · TMDB
          </span>
        </div>
        <div className="flex flex-col gap-4">
          {reviews.slice(0, 5).map((r) => (
            <div key={r.id} className="border-b border-border pb-4 last:border-0">
              <div className="mb-2 flex items-center gap-3">
                <Avatar name={r.author} src={r.avatarUrl} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{r.author}</p>
                  <p className="text-xs text-foreground-muted">{formatDistanceToNow(r.createdAt)}</p>
                </div>
                {r.rating != null && <RatingStars value={Math.round((r.rating / 2) * 2) / 2} size={13} />}
              </div>
              <p className="line-clamp-6 text-sm leading-relaxed text-foreground-muted">{r.content}</p>
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-xs text-accent hover:underline"
              >
                Read full review on TMDB
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
