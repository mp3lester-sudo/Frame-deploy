import { Avatar } from "@/components/ui/avatar";
import { formatDistanceToNow } from "@/lib/date";
import type { TmdbReview } from "@/lib/external/tmdb-reviews";

export function TmdbReviewsSection({ reviews }: { reviews: TmdbReview[] }) {
  if (!reviews.length) return null;

  return (
    <section className="mt-10">
      <h2 className="mb-3 text-lg font-semibold">Critic &amp; Community Reviews</h2>
      <p className="mb-4 -mt-2 text-xs text-foreground-muted">Sourced from TMDB</p>
      <div className="flex flex-col gap-4">
        {reviews.slice(0, 5).map((r) => (
          <div key={r.id} className="border-b border-border pb-4 last:border-0">
            <div className="mb-2 flex items-center gap-3">
              <Avatar name={r.author} src={r.avatarUrl} size={32} />
              <div>
                <p className="text-sm font-medium">{r.author}</p>
                <p className="text-xs text-foreground-muted">
                  {formatDistanceToNow(r.createdAt)}
                  {r.rating != null && ` · ${r.rating}/10`}
                </p>
              </div>
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
    </section>
  );
}
