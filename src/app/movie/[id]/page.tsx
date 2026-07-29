import Image from "next/image";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RateControl } from "@/components/rate-control";
import { WatchlistButton } from "@/components/watchlist-button";
import { AddToListMenu, type AddToListMenuList } from "@/components/add-to-list-menu";
import { ReviewCard } from "@/components/review-card";
import { CreditsSection, type Credit } from "@/components/credits-row";
import { Badge } from "@/components/ui/badge";
import { formatRuntime } from "@/lib/utils";
import { aggregateReactions } from "@/lib/reactions/aggregate";
import type { DisplayComment } from "@/components/review-comments";

export default async function MovieDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();

  const [{ data: title }, { data: reviews }, { data: userRating }, { data: credits }, { data: watchlistRow }, { data: myLists }] =
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
        .select("credit_type, character_name, billing_order, people(name, photo_url)")
        .eq("title_id", id),
      viewer
        ? supabase.from("watchlist").select("id").eq("title_id", id).eq("user_id", viewer.id).maybeSingle()
        : Promise.resolve({ data: null }),
      viewer
        ? supabase.from("lists").select("id, title").eq("user_id", viewer.id).order("created_at", { ascending: false })
        : Promise.resolve({ data: null }),
    ]);

  if (!title) notFound();

  const myListIds = (myLists ?? []).map((l) => l.id);
  const { data: listItemsForThisTitle } = myListIds.length
    ? await supabase.from("list_items").select("list_id").eq("title_id", id).in("list_id", myListIds)
    : { data: [] };
  const listIdsWithTitle = new Set((listItemsForThisTitle ?? []).map((li) => li.list_id));
  const addToListMenuLists: AddToListMenuList[] = (myLists ?? []).map((l) => ({
    id: l.id,
    title: l.title,
    hasTitle: listIdsWithTitle.has(l.id),
  }));

  const reviewIds = (reviews ?? []).map((r) => r.id);
  const reviewerIds = [...new Set((reviews ?? []).map((r) => r.user_id))];
  const { data: reviewerRatingRows } = reviewerIds.length
    ? await supabase.from("ratings").select("user_id, score").eq("title_id", id).in("user_id", reviewerIds)
    : { data: [] };
  const ratingByReviewer = new Map((reviewerRatingRows ?? []).map((r) => [r.user_id, r.score]));
  const [{ data: reactionRows }, { data: commentRows }] = reviewIds.length
    ? await Promise.all([
        supabase.from("review_reactions").select("review_id, reaction, user_id").in("review_id", reviewIds),
        supabase
          .from("review_comments")
          .select("id, review_id, user_id, body, created_at, profiles(username, avatar_url)")
          .in("review_id", reviewIds)
          .order("created_at", { ascending: true }),
      ])
    : [{ data: [] }, { data: [] }];
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

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="relative aspect-[2/3] w-40 shrink-0 overflow-hidden rounded-[var(--radius-lg)] bg-surface-raised sm:w-56">
          {title.poster_url && (
            <Image src={title.poster_url} alt={title.name} fill className="object-cover" />
          )}
        </div>

        <div className="flex-1">
          <h1 className="text-2xl font-semibold sm:text-3xl">{title.name}</h1>
          <p className="mt-1 text-sm text-foreground-muted">
            {title.release_date?.slice(0, 4)} · {formatRuntime(title.runtime_minutes)}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {title.genres?.map((g) => (
              <Badge key={g}>{g}</Badge>
            ))}
          </div>

          <p className="mt-4 text-sm leading-relaxed text-foreground-muted">{title.overview}</p>

          <CreditsSection credits={(credits ?? []) as unknown as Credit[]} />

          <div className="mt-6">
            <p className="mb-1 text-xs uppercase tracking-wide text-foreground-muted">Your rating</p>
            <RateControl titleId={title.id} initialScore={userRating?.score ?? 0} />
          </div>

          {viewer && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <WatchlistButton titleId={title.id} initiallyOnWatchlist={!!watchlistRow} />
              <AddToListMenu titleId={title.id} lists={addToListMenuLists} />
            </div>
          )}
        </div>
      </div>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">Reviews</h2>
        {reviews?.length ? (
          reviews.map((r) => (
            <ReviewCard
              key={r.id}
              reviewId={r.id}
              authorName={(r as unknown as { profiles: { username: string } }).profiles?.username ?? "Someone"}
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
    </div>
  );
}
