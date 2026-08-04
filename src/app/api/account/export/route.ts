import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";

/**
 * GDPR-style "export my data" -- previously the only way to see what
 * Backlot has on you was to piece it together across a dozen different
 * pages by hand. Uses the request-scoped client (not service role), so
 * this is naturally bounded by RLS on top of the explicit user_id filters
 * below -- a bug in this route can leak at most what its own session is
 * already allowed to read, never someone else's private data.
 *
 * Deliberately not exhaustive down to every join table (e.g. individual
 * list_items, club_posts) -- this covers every table that's clearly
 * "about this person" on its own (their ratings, reviews, follows,
 * subscription, etc.), which is the substance of what someone asking
 * "what do you have on me" actually wants.
 */
export async function GET() {
  const supabase = await createClient();
  const user = await getVerifiedUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [
    profile,
    ratings,
    reviews,
    reviewComments,
    reviewReactions,
    watchHistory,
    watchlist,
    favoriteTitles,
    followingRows,
    followerRows,
    lists,
    clubMemberships,
    movieNightsHosted,
    movieNightParticipation,
    messagesSent,
    subscription,
    pushSubscriptions,
    notificationPreferences,
    wrappedShares,
    reportsFiled,
    blocks,
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("ratings").select("*").eq("user_id", user.id),
    supabase.from("reviews").select("*").eq("user_id", user.id),
    supabase.from("review_comments").select("*").eq("user_id", user.id),
    supabase.from("review_reactions").select("*").eq("user_id", user.id),
    supabase.from("watch_history").select("*").eq("user_id", user.id),
    supabase.from("watchlist").select("*").eq("user_id", user.id),
    supabase.from("favorite_titles").select("*").eq("user_id", user.id),
    supabase.from("follows").select("followee_id, created_at").eq("follower_id", user.id),
    supabase.from("follows").select("follower_id, created_at").eq("followee_id", user.id),
    supabase.from("lists").select("*").eq("user_id", user.id),
    supabase.from("club_members").select("*").eq("user_id", user.id),
    supabase.from("movie_nights").select("*").eq("host_id", user.id),
    supabase.from("movie_night_participants").select("*").eq("user_id", user.id),
    supabase.from("messages").select("*").eq("sender_id", user.id),
    supabase.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("push_subscriptions").select("id, endpoint, created_at").eq("user_id", user.id),
    supabase.from("notification_preferences").select("*").eq("user_id", user.id),
    supabase.from("wrapped_shares").select("*").eq("user_id", user.id),
    supabase.from("reports").select("*").eq("reporter_id", user.id),
    supabase.from("user_blocks").select("blocked_id, created_at").eq("blocker_id", user.id),
  ]);

  const payload = {
    exported_at: new Date().toISOString(),
    account: { id: user.id, email: user.email },
    profile: profile.data,
    ratings: ratings.data ?? [],
    reviews: reviews.data ?? [],
    review_comments: reviewComments.data ?? [],
    review_reactions: reviewReactions.data ?? [],
    watch_history: watchHistory.data ?? [],
    watchlist: watchlist.data ?? [],
    favorite_titles: favoriteTitles.data ?? [],
    following: followingRows.data ?? [],
    followers: followerRows.data ?? [],
    lists: lists.data ?? [],
    club_memberships: clubMemberships.data ?? [],
    movie_nights_hosted: movieNightsHosted.data ?? [],
    movie_night_participation: movieNightParticipation.data ?? [],
    messages_sent: messagesSent.data ?? [],
    subscription: subscription.data,
    push_subscriptions: pushSubscriptions.data ?? [],
    notification_preferences: notificationPreferences.data ?? [],
    wrapped_shares: wrappedShares.data ?? [],
    reports_filed: reportsFiled.data ?? [],
    blocked_users: blocks.data ?? [],
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="backlot-data-export-${user.id.slice(0, 8)}.json"`,
    },
  });
}
