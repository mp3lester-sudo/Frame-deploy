import Link from "next/link";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { PostCard } from "@/components/social/post-card";
import { IndieBuzzStrip } from "@/components/social/indie-buzz-strip";
import { FAKE_POSTS } from "@/lib/social/fake-posts";
import { getIndieReleases } from "@/lib/news/tmdb-releases";
import { getIndieNews } from "@/lib/news/indie-news";

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

  // Same live release calendar + IndieWire headlines as the home page's
  // Indie Spotlight section (lib/news/*), condensed into a strip for this
  // single-column layout -- not scoped to this user, so it's fetched
  // alongside rather than blocking on anything user-specific.
  const [indieReleases, indieNews] = await Promise.all([getIndieReleases(), getIndieNews()]);

  return (
    <div className="mx-auto max-w-2xl pb-12">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/90 px-4 py-4 backdrop-blur sm:px-5">
        <h1 className="font-section-heading text-2xl">Social</h1>
        {/* Clubs link relocated here from Home (Option B declutter) --
            same treatment as the existing Hot Takes link next to it. */}
        <div className="flex items-center gap-4">
          <Link href="/clubs" className="text-xs uppercase tracking-wider text-foreground-muted hover:text-accent">
            Clubs &rarr;
          </Link>
          <Link href="/hot-takes" className="text-xs uppercase tracking-wider text-foreground-muted hover:text-accent">
            Hot Takes &rarr;
          </Link>
        </div>
      </div>

      <IndieBuzzStrip releases={indieReleases} news={indieNews} />

      <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
        {FAKE_POSTS.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>

      <p className="px-4 pt-6 text-center text-xs text-foreground-muted sm:px-5">
        You&rsquo;re all caught up.
      </p>
    </div>
  );
}
