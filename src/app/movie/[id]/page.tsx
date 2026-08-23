import Image from "@/components/ui/fade-image";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { RateControl } from "@/components/rate-control";
import { WatchlistButton } from "@/components/watchlist-button";
import { AddToListMenu, type AddToListMenuList } from "@/components/add-to-list-menu";
import { ReviewCard } from "@/components/review-card";
import { WriteReviewForm } from "@/components/write-review-form";
import { CreditsSection, type Credit } from "@/components/credits-row";
import { Badge } from "@/components/ui/badge";
import { RtBadge } from "@/components/rt-badge";
import { TmdbReviewsSection } from "@/components/tmdb-reviews-section";
import { formatRuntime } from "@/lib/utils";
import { aggregateReactions } from "@/lib/reactions/aggregate";
import type { DisplayComment } from "@/components/review-comments";
import { getOrFetchRtCriticScore } from "@/lib/external/rotten-tomatoes";
import { getTmdbReviews } from "@/lib/external/tmdb-reviews";
import { getTmdbTrailer } from "@/lib/external/tmdb-videos";
import { getOrFetchWatchProviders } from "@/lib/external/tmdb-watch-providers";
import { WhereToWatch } from "@/components/where-to-watch";
import { BackdropHero } from "@/components/backdrop-hero";
import { CustomizeTitleImages } from "@/components/movie/customize-title-images";
import { getMyTitleImageOverride } from "@/lib/actions/title-image-overrides";
import { isAuteurActive } from "@/lib/premium/tier";
import { getMySeasonRatings } from "@/lib/actions/season-ratings";
import { SeasonRatings } from "@/components/season-ratings";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: title } = await supabase
    .from("titles")
    .select("name, overview, poster_url, release_date")
    .eq("id", id)
    .maybeSingle();

  if (!title) return { title: "Title not found" };

  const year = title.release_date ? new Date(title.release_date).getFullYear() : null;
  const displayName = year ? `${title.name} (${year})` : title.name;
  const description = title.overview?.slice(0, 200) || `Ratings, reviews, and where to watch ${title.name} on Slate.`;

  return {
    title: displayName,
    description,
    openGraph: {
      title: displayName,
      description,
      images: title.poster_url ? [{ url: title.poster_url }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: displayName,
      description,
      images: title.poster_url ? [title.poster_url] : undefined,
    },
  };
}

export default async function MovieDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const viewer = await getVerifiedUser();

  const [
    { data: title },
    { data: reviews },
    { data: userRating },
    { data: credits },
    { data: watchlistRow },
    { data: myLists },
    { data: viewerProfile },
    imageOverride,
    mySeasonRatings,
  ] =
    await Promise.all([
      supabase.from("titles").select("*").eq("id", id).single(),
      supabase
        .from("reviews")
        // No FK links reviews to ratings directly (they're sibling tables,
        // both keyed on user_id+title_id), so a reviewer's own rating on this
        // title can't be embedded here — fetched separately below instead.
        // The explicit !reviews_user_id_fkey hint disambiguates profiles,
        // which otherwise has two valid join paths from reviews (direct
        // authorship, and indirectly via review_reactions).
        .select("*, profiles!reviews_user_id_fkey(username, avatar_url)")
        .eq("title_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
      viewer
        ? supabase.from("ratings").select("score").eq("title_id", id).eq("user_id", viewer.id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("title_credits")
        .select("credit_type, character_name, billing_order, people(id, name, photo_url)")
        .eq("title_id", id),
      viewer
        ? supabase.from("watchlist").select("id").eq("title_id", id).eq("user_id", viewer.id).maybeSingle()
        : Promise.resolve({ data: null }),
      viewer
        ? supabase.from("lists").select("id, title").eq("user_id", viewer.id).order("created_at", { ascending: false })
        : Promise.resolve({ data: null }),
      // Auteur check for the customize-art affordance below -- separate
      // from viewer itself since getVerifiedUser doesn't carry
      // premium_tier.
      viewer
        ? supabase.from("profiles").select("is_premium, premium_tier").eq("id", viewer.id).maybeSingle()
        : Promise.resolve({ data: null }),
      // Per-viewer poster/backdrop override (Auteur perk, task #339) --
      // fetched unconditionally for any signed-in viewer, not just
      // Auteur, so a lapsed subscriber's existing custom art still
      // displays (see getMyTitleImageOverride's doc comment); the *button
      // to change it* is what's actually gated below.
      viewer ? getMyTitleImageOverride(id) : Promise.resolve(null),
      // Per-season ratings (optional, TV only, task #544) -- empty map
      // for movies and logged-out visitors, cheap to fetch unconditionally
      // here since getMySeasonRatings itself no-ops without a viewer.
      viewer ? getMySeasonRatings(id) : Promise.resolve({}),
    ]);

  if (!title) notFound();

  // These four groups only depend on data already resolved by the first
  // Promise.all above (title, reviews, myLists) -- none of them depend on
  // each other, so they used to run as four separate sequential await
  // blocks (rtScore/etc, then list membership, then reviewer ratings,
  // then reactions/comments) purely because they were written in that
  // order. Folded into one Promise.all so they run concurrently instead.
  const myListIds = (myLists ?? []).map((l) => l.id);
  const reviewIds = (reviews ?? []).map((r) => r.id);
  const reviewerIds = [...new Set((reviews ?? []).map((r) => r.user_id))];

  const [
    rtScore,
    tmdbReviews,
    watchProviders,
    trailer,
    { data: listItemsForThisTitle },
    { data: reviewerRatingRows },
    { data: reactionRows },
    { data: commentRows },
  ] = await Promise.all([
    getOrFetchRtCriticScore(title),
    title.tmdb_id ? getTmdbReviews(title.tmdb_id, title.type) : Promise.resolve([]),
    getOrFetchWatchProviders(title),
    title.tmdb_id ? getTmdbTrailer(title.tmdb_id, title.type) : Promise.resolve(null),
    myListIds.length
      ? supabase.from("list_items").select("list_id").eq("title_id", id).in("list_id", myListIds)
      : Promise.resolve({ data: [] }),
    reviewerIds.length
      ? supabase.from("ratings").select("user_id, score").eq("title_id", id).in("user_id", reviewerIds)
      : Promise.resolve({ data: [] }),
    reviewIds.length
      ? supabase.from("review_reactions").select("review_id, reaction, user_id").in("review_id", reviewIds)
      : Promise.resolve({ data: [] }),
    reviewIds.length
      ? supabase
          .from("review_comments")
          .select("id, review_id, user_id, body, created_at, profiles(username, avatar_url)")
          .in("review_id", reviewIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  const listIdsWithTitle = new Set((listItemsForThisTitle ?? []).map((li) => li.list_id));
  const addToListMenuLists: AddToListMenuList[] = (myLists ?? []).map((l) => ({
    id: l.id,
    title: l.title,
    hasTitle: listIdsWithTitle.has(l.id),
  }));

  const ratingByReviewer = new Map((reviewerRatingRows ?? []).map((r) => [r.user_id, r.score]));
  const reactionsByReview = aggregateReactions(reactionRows ?? [], viewer?.id ?? null);

  const commentsByReview = new Map<string, DisplayComment[]>();
  for (const c of commentRows ?? []) {
    const profile = (c as unknown as { profiles: { username: string; avatar_url: string | null } | null }).profiles;
    const list = commentsByReview.get(c.review_id) ?? [];
    list.push({
      id: c.id,
      userId: c.user_id,
      username: profile?.username ?? "Someone",
      avatarUrl: profile?.avatar_url ?? null,
      body: c.body,
      createdAt: c.created_at,
    });
    commentsByReview.set(c.review_id, list);
  }

  // Per-viewer poster/backdrop override wins over the catalogue default
  // when set (Auteur perk, task #339) -- imageOverride is null for
  // logged-out visitors and anyone who hasn't set one.
  const effectivePosterUrl = imageOverride?.poster_url || title.poster_url;
  const effectiveBackdropUrl = imageOverride?.backdrop_url || title.backdrop_url;
  const isAuteur = isAuteurActive(viewerProfile);

  return (
    <div>
      {effectiveBackdropUrl && (
        <BackdropHero backdropUrl={effectiveBackdropUrl} trailerKey={trailer?.key ?? null} title={title.name} />
      )}
      {/* Negative top margin pulls the poster/title row up into the
          hero's bottom fade (see backdrop-hero.tsx) so the title reads
          as sitting on top of the backdrop, matching the reference
          layout. The offset is sized to the title/rating/badge stack --
          by the time we reach the overview paragraph we're clear of the
          hero and on solid background. */}
      <div className={`relative mx-auto max-w-4xl px-4 pb-8 ${effectiveBackdropUrl ? "-mt-20 sm:-mt-28" : "py-8"}`}>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="relative aspect-[2/3] w-40 shrink-0 overflow-hidden rounded-[var(--radius-lg)] bg-surface-raised shadow-[0_12px_32px_-8px_rgba(0,0,0,0.6)] sm:w-56">
          {effectivePosterUrl && (
            <Image src={effectivePosterUrl} alt={title.name} fill className="object-cover" />
          )}
        </div>

        <div className="flex-1">
          <h1 className="font-display text-2xl sm:text-3xl">{title.name}</h1>
          <p className="mt-1 text-sm text-foreground-muted">
            {title.release_date?.slice(0, 4)} · {formatRuntime(title.runtime_minutes)}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {rtScore != null && <RtBadge score={rtScore} />}
            {title.genres?.map((g) => (
              <Badge key={g}>{g}</Badge>
            ))}
          </div>

          <p className="mt-4 text-sm leading-relaxed text-foreground-muted">{title.overview}</p>

          <CreditsSection credits={(credits ?? []) as unknown as Credit[]} />

          <WhereToWatch offers={watchProviders} />

          {/* Redesign pass: rating stars now sit inline with the
              watchlist/add-to-list row instead of stacking above it in
              their own labeled block -- three separate actions (rate,
              save, organize) read as one governed CTA row this way
              rather than two visually disconnected sections. Dropped the
              "Your rating" caption that used to sit above the stars --
              RatingStars is self-explanatory next to a Watchlist button
              with its own icon+label, and the row reads cleaner without
              a third piece of label text competing with the other two. */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <RateControl titleId={title.id} initialScore={userRating?.score ?? 0} />
            {viewer && (
              <>
                <WatchlistButton titleId={title.id} initiallyOnWatchlist={!!watchlistRow} />
                <AddToListMenu titleId={title.id} lists={addToListMenuLists} />
              </>
            )}
          </div>
          {viewer && title.type === "tv" && !!title.number_of_seasons && (
            <div className="mt-3">
              <SeasonRatings
                titleId={title.id}
                numberOfSeasons={title.number_of_seasons}
                initialRatings={mySeasonRatings as Record<number, number>}
              />
            </div>
          )}

          {isAuteur && (
            <div className="mt-4">
              <CustomizeTitleImages
                titleId={title.id}
                hasOverride={!!imageOverride}
                initialPosterUrl={imageOverride?.poster_url ?? ""}
                initialBackdropUrl={imageOverride?.backdrop_url ?? ""}
              />
            </div>
          )}
        </div>
      </div>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">Reviews</h2>
        {viewer && (
          <div className="mb-4">
            <WriteReviewForm titleId={title.id} />
          </div>
        )}
        {reviews?.length ? (
          reviews.map((r) => (
            <ReviewCard
              key={r.id}
              reviewId={r.id}
              authorId={r.user_id}
              authorName={(r as unknown as { profiles: { username: string } }).profiles?.username ?? "Someone"}
              authorUsername={(r as unknown as { profiles: { username: string | null } }).profiles?.username}
              authorAvatarUrl={(r as unknown as { profiles: { avatar_url: string | null } }).profiles?.avatar_url}
              body={r.body}
              containsSpoilers={r.contains_spoilers}
              createdAt={r.created_at}
              rating={ratingByReviewer.get(r.user_id)}
              reactions={reactionsByReview.get(r.id)}
              canReact={!!viewer}
              comments={commentsByReview.get(r.id) ?? []}
              viewerId={viewer?.id ?? null}
            />
          ))
        ) : (
          <p className="text-sm text-foreground-muted">No reviews yet — be the first.</p>
        )}
      </section>

      <TmdbReviewsSection reviews={tmdbReviews} />
      </div>
    </div>
  );
}
