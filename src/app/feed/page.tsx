import Link from "next/link";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { PostCard } from "@/components/social/post-card";
import { IndieBuzzStrip } from "@/components/social/indie-buzz-strip";
import { FAKE_POSTS } from "@/lib/social/fake-posts";
import { getIndieReleases } from "@/lib/news/tmdb-releases";
import { getIndieNews } from "@/lib/news/indie-news";

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
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur">
        <SocialTabs />
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
