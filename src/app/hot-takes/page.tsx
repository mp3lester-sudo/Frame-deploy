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
        The most agreed- and disagreed-with reviews on Marquee right now.
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

            // Verdict ratio -- agree vs. disagree reaction counts rendered
            // as a visual bar instead of two raw numbers, so the
            // "controversy" that got a review onto this feed in the first
            // place is legible at a glance. hot_take/need_to_watch
            // reactions don't factor into agreement, only agree/disagree
            // do (rankByControversy also weighs hot_take, but that signals
            // "this take is spicy", not "here's the split").
            const summary = reactionsByReview.get(reviewId);
            const agreeCount = summary?.counts.agree ?? 0;
            const disagreeCount = summary?.counts.disagree ?? 0;
            const verdictTotal = agreeCount + disagreeCount;
            const agreePct = verdictTotal > 0 ? Math.round((agreeCount / verdictTotal) * 100) : null;

            return (
              // Verdict backdrop: the movie leads the card as a full-width
              // poster wash instead of a 24px thumbnail buried in a text
              // row, with a short pull-quote from the review overlaid
              // marquee-style (skipped for spoiler-flagged reviews -- the
              // full text still lives below, gated behind the existing
              // reveal). The full ReviewCard renders underneath exactly as
              // before; this backdrop is a preview layer on top of it, the
              // same pattern the Social tab's photo posts already use.
              <div key={reviewId} className="bento-card overflow-hidden">
                {title && (
                  <div className="relative h-36 w-full overflow-hidden bg-surface-raised">
                    {title.poster_url ? (
                      <Image
                        src={title.poster_url}
                        alt={title.name}
                        fill
                        sizes="(min-width: 640px) 560px, 100vw"
                        className="object-cover"
                      />
                    ) : (
                      <div
                        className="absolute inset-0"
                        style={{ backgroundImage: "linear-gradient(140deg, #4a1f1f, #1c0d0d 55%, #0a0908)" }}
                      />
                    )}
                    <div
                      className="pointer-events-none absolute inset-0"
                      style={{
                        backgroundImage:
                          "linear-gradient(0deg, rgba(10,9,8,0.94) 12%, rgba(10,9,8,0.15) 48%, rgba(10,9,8,0.45) 100%)",
                      }}
                    />
                    <Link
                      href={`/movie/${title.id}`}
                      className="absolute left-3 top-3 text-[10px] font-medium uppercase tracking-wider text-accent hover:underline"
                    >
                      {title.name}
                    </Link>
                    {!review.contains_spoilers && (
                      <p className="font-display absolute bottom-9 left-3 right-3 line-clamp-2 text-sm italic leading-snug text-foreground drop-shadow">
                        &ldquo;{review.body}&rdquo;
                      </p>
                    )}
                    {agreePct !== null && (
                      <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-accent/20">
                          <div className="h-full rounded-full bg-accent" style={{ width: `${agreePct}%` }} />
                        </div>
                        <span className="text-[10px] font-medium text-accent-soft">{agreePct}% agree</span>
                      </div>
                    )}
                  </div>
                )}
                <div className="p-4">
                  <ReviewCard
                    reviewId={review.id}
                    authorId={review.user_id}
                    authorName={profile?.username ?? "Someone"}
                    authorUsername={profile?.username}
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
