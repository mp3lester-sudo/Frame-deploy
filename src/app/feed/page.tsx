import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { PostCard } from "@/components/social/post-card";
import type { SocialPost } from "@/lib/social/post";
import { IndieBuzzStrip } from "@/components/social/indie-buzz-strip";
import { getIndieReleases } from "@/lib/news/tmdb-releases";
import { getIndieNews } from "@/lib/news/indie-news";
import { aggregateReactions } from "@/lib/reactions/aggregate";
import { formatDistanceToNow } from "@/lib/date";

/**
 * Ticket-stub tab bar -- Social / Clubs / Hot takes read as three sections
 * of the same social wing rather than one page with two escape-hatch
 * links off in a corner (the prior header). The active tab (always
 * "Social" here, since Clubs and Hot Takes are their own routes) gets the
 * gold underline; the other two are plain links out.
 */
function SocialTabs() {
  const tabs = [
    { label: "Social", href: "/feed", active: true },
    { label: "Clubs", href: "/clubs", active: false },
    { label: "Hot takes", href: "/hot-takes", active: false },
  ];
  return (
    <div className="flex border-b border-border">
      {tabs.map((tab) => (
        <Link
          key={tab.label}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={`flex-1 border-b-2 py-3 text-center text-sm transition-colors ${
            tab.active
              ? "border-accent text-accent"
              : "border-transparent text-foreground-muted hover:text-accent"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

type ReviewRow = {
  id: string;
  user_id: string;
  title_id: string;
  body: string;
  created_at: string;
  profiles: { username: string; display_name: string | null; avatar_url: string | null } | null;
  titles: { id: string; name: string; poster_url: string | null } | null;
};

const REVIEWS_SELECT =
  "id, user_id, title_id, body, created_at, profiles!reviews_user_id_fkey(username, display_name, avatar_url), titles(id, name, poster_url)";

// How far back to look when aggregating reactions/comments -- bounds the
// work the same way Hot Takes' REVIEW_WINDOW does.
const REVIEW_WINDOW = 200;
const FEED_SIZE = 20;
// Below this many followed-author reviews, fall back to a sitewide feed.
// A brand-new account follows few or no one yet, so a strict "people you
// follow" feed (the promise made in the logged-out copy below) would just
// render empty on day one -- Hot Takes already proved a sitewide review
// feed works fine, so this reuses that instead of showing a blank page.
const FOLLOWED_FEED_MIN = 6;

export default async function FeedPage() {
  const user = await getVerifiedUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center text-sm text-foreground-muted">
        <Link href="/login" className="text-accent hover:underline">
          Log in
        </Link>{" "}
        to see what people you follow are watching.
      </div>
    );
  }

  const supabase = await createClient();

  // Same live release calendar + IndieWire headlines as the home page's
  // Indie Spotlight section (lib/news/*), condensed into a strip for this
  // single-column layout -- not scoped to this user, so it's fetched
  // alongside everything else rather than blocking on anything
  // user-specific.
  const [{ data: followRows }, indieReleases, indieNews] = await Promise.all([
    supabase.from("follows").select("followee_id").eq("follower_id", user.id),
    getIndieReleases(),
    getIndieNews(),
  ]);

  const followedIds = [...new Set((followRows ?? []).map((f) => f.followee_id))];
  const scopedToFollows = followedIds.length > 0;

  const followedQuery = supabase
    .from("reviews")
    .select(REVIEWS_SELECT)
    .order("created_at", { ascending: false })
    .limit(REVIEW_WINDOW);

  const { data: firstPass } = scopedToFollows
    ? await followedQuery.in("user_id", followedIds)
    : await followedQuery;

  const needsSitewideFallback = scopedToFollows && (firstPass?.length ?? 0) < FOLLOWED_FEED_MIN;
  const { data: reviews } = needsSitewideFallback
    ? await supabase.from("reviews").select(REVIEWS_SELECT).order("created_at", { ascending: false }).limit(REVIEW_WINDOW)
    : { data: firstPass };

  const rows = (reviews ?? []) as unknown as ReviewRow[];
  const reviewIds = rows.map((r) => r.id);

  const [{ data: reactionRows }, { data: commentRows }] = await Promise.all([
    reviewIds.length
      ? supabase.from("review_reactions").select("review_id, reaction, user_id").in("review_id", reviewIds)
      : Promise.resolve({ data: [] as { review_id: string; reaction: string; user_id: string }[] }),
    reviewIds.length
      ? supabase.from("review_comments").select("review_id").in("review_id", reviewIds)
      : Promise.resolve({ data: [] as { review_id: string }[] }),
  ]);

  const reactionsByReview = aggregateReactions(reactionRows ?? [], null);
  const commentCountByReview = new Map<string, number>();
  for (const row of commentRows ?? []) {
    commentCountByReview.set(row.review_id, (commentCountByReview.get(row.review_id) ?? 0) + 1);
  }

  // Likes maps onto the "agree" reaction -- the closest real analog to a
  // Twitter-style like (approval/agreement with the take). Reposts has no
  // real feature equivalent in the app, so it's always 0 rather than
  // faking a number.
  const posts: SocialPost[] = rows.slice(0, FEED_SIZE).map((review) => {
    const counts = reactionsByReview.get(review.id)?.counts;
    return {
      id: review.id,
      authorId: review.user_id,
      authorName: review.profiles?.display_name || review.profiles?.username || "Someone",
      authorUsername: review.profiles?.username ?? "",
      avatarUrl: review.profiles?.avatar_url ?? null,
      timeAgo: formatDistanceToNow(review.created_at),
      body: review.body,
      photo: review.titles?.poster_url
        ? { url: review.titles.poster_url, caption: review.titles.name, orientation: "poster" as const }
        : undefined,
      stats: {
        likes: counts?.agree ?? 0,
        comments: commentCountByReview.get(review.id) ?? 0,
        reposts: 0,
      },
    };
  });

  return (
    <div className="mx-auto max-w-2xl pb-12">
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur">
        <h1 className="text-gold-foil font-section-heading px-4 pt-4 text-3xl sm:px-5">Social</h1>
        <SocialTabs />
      </div>

      <IndieBuzzStrip releases={indieReleases} news={indieNews} />

      <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
        {posts.length === 0 ? (
          <p className="py-8 text-center text-sm text-foreground-muted">
            No reviews yet — follow a few people or write the first one.
          </p>
        ) : (
          posts.map((post) => <PostCard key={post.id} post={post} />)
        )}
      </div>

      <p className="px-4 pt-6 text-center text-xs text-foreground-muted sm:px-5">
        You&rsquo;re all caught up.
      </p>
    </div>
  );
}
