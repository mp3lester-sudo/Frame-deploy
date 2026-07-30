import Link from "next/link";
import Image from "@/components/ui/fade-image";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { ReviewCard } from "@/components/review-card";
import { aggregateReactions } from "@/lib/reactions/aggregate";
import { rankByControversy } from "@/lib/reactions/rank";

// How far back to look for candidate reviews — bounds the aggregation work
// and keeps the feed feeling current rather than dredging up a years-old
// review that happened to get one reaction ages ago.
const REVIEW_WINDOW = 500;
const FEED_SIZE = 20;

export default async function HotTakesPage() {
  const supabase = await createClient();
  const viewer = await getVerifiedUser();

  const { data: reviews } = await supabase
    .from("reviews")
    // The !reviews_user_id_fkey hint disambiguates profiles, which has two
    // valid join paths from reviews (direct authorship, and indirectly via
    // review_reactions). Ratings aren't embeddable at all — no FK links
    // reviews to ratings (they're sibling tables, both keyed on
    // user_id+title_id) — so each reviewer's rating is fetched separately
    // below and matched by that same (user_id, title_id) pair.
    .select("id, user_id, title_id, body, contains_spoilers, created_at, profiles!reviews_user_id_fkey(username, avatar_url), titles(id, name, poster_url)")
    .order("created_at", { ascending: false })
    .limit(REVIEW_WINDOW);

  const reviewIds = (reviews ?? []).map((r) => r.id);
  const reviewerIds = [...new Set((reviews ?? []).map((r) => r.user_id))];
  const reviewedTitleIds = [...new Set((reviews ?? []).map((r) => r.title_id))];

  const [{ data: reactionRows }, { data: ratingRows }] = await Promise.all([
    reviewIds.length
      ? supabase.from("review_reactions").select("review_id, reaction, user_id").in("review_id", reviewIds)
      : Promise.resolve({ data: [] }),
    reviewerIds.length && reviewedTitleIds.length
      ? supabase.from("ratings").select("user_id, title_id, score").in("user_id", reviewerIds).in("title_id", reviewedTitleIds)
      : Promise.resolve({ data: [] }),
  ]);

  const ranked = rankByControversy(reviewIds, reactionRows ?? []).slice(0, FEED_SIZE);
  const reviewById = new Map((reviews ?? []).map((r) => [r.id, r]));
  const reactionsByReview = aggregateReactions(reactionRows ?? [], viewer?.id ?? null);
  const ratingByReviewerAndTitle = new Map((ratingRows ?? []).map((r) => [`${r.user_id}|${r.title_id}`, r.score]));

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-display text-2xl">Hot Takes</h1>
      <p className="mt-1 text-sm text-foreground-muted">
        The most agreed- and disagreed-with reviews on Backlot right now.
      </p>

      {ranked.length === 0 ? (
        <p className="mt-6 text-sm text-foreground-muted">
          Nothing here yet — react to a review to help surface the first one.
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {ranked.map(({ reviewId }) => {
            const review = reviewById.get(reviewId);
            if (!review) return null;
            const title = (review as unknown as { titles: { id: string; name: string; poster_url: string | null } | null }).titles;
            const profile = (review as unknown as { profiles: { username: string; avatar_url: string | null } | null }).profiles;
            const rating = ratingByReviewerAndTitle.get(`${review.user_id}|${review.title_id}`);

            return (
              // The title link and the review used to be two separate
              // blocks stacked with no shared container — a poster/title
              // row, then a totally distinct avatar/name row right below
              // it. Wrapping both in one bordered card ties them together
              // as "this review, about this movie, by this person" the way
              // every other card-based screen in the app already reads.
              <div key={reviewId} className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
                {title && (
                  <Link
                    href={`/movie/${title.id}`}
                    className="mb-3 flex items-center gap-2 text-sm text-foreground-muted hover:text-accent"
                  >
                    {title.poster_url && (
                      <span className="relative block h-9 w-6 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-surface-raised">
                        <Image src={title.poster_url} alt={title.name} fill className="object-cover" />
                      </span>
                    )}
                    {title.name}
                  </Link>
                )}
                <ReviewCard
                  reviewId={review.id}
                  authorName={profile?.username ?? "Someone"}
                  authorAvatarUrl={profile?.avatar_url}
                  body={review.body}
                  containsSpoilers={review.contains_spoilers}
                  createdAt={review.created_at}
                  rating={rating}
                  reactions={reactionsByReview.get(review.id)}
                  canReact={!!viewer}
                  viewerId={viewer?.id ?? null}
                  showComments={false}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
