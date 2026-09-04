/**
 * Shared card shape for the Social feed (src/app/feed) and its PostCard
 * component. This file used to also export a hardcoded FAKE_POSTS array --
 * demo content for a feed that predated there being enough real reviews to
 * fill one. Now that real accounts are posting real reviews, feed/page.tsx
 * builds this shape straight from the `reviews` table (the same join Hot
 * Takes already uses), so only the shared type remains here.
 */
export interface SocialPost {
  id: string;
  authorId: string;
  authorName: string;
  /** Profile username -- used for both the @handle display and linking
   *  the avatar/name to /profile/[username], same pattern as ReviewCard. */
  authorUsername: string;
  avatarUrl: string | null;
  timeAgo: string;
  body: string;
  photo?: { url: string; caption: string; orientation: "poster" | "still" };
  stats: { likes: number; comments: number };
  /** The title this review is about -- launch-audit finding: posts had no
   *  way to reach the movie/show being reviewed, only the author's profile.
   *  Null only if the underlying review's title was deleted. */
  titleId: string | null;
  titleName: string | null;
  /** The viewer's own reaction on the underlying review, so the feed's
   *  Like button can reflect and toggle real state instead of being a
   *  dead, always-off icon. "agree" is the reaction Like maps onto --
   *  see feed/page.tsx's REVIEWS_SELECT comment for why. */
  myReaction: import("@/lib/constants/social").ReviewReaction | null;
  canReact: boolean;
}
