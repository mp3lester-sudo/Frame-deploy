import Link from "next/link";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { PostCard } from "@/components/social/post-card";
import { FAKE_POSTS } from "@/lib/social/fake-posts";

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

  return (
    <div className="mx-auto max-w-2xl pb-12">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/90 px-4 py-4 backdrop-blur sm:px-5">
        <h1 className="font-section-heading text-2xl">Social</h1>
        <Link href="/hot-takes" className="text-xs uppercase tracking-wider text-foreground-muted hover:text-accent">
          Hot Takes &rarr;
        </Link>
      </div>

      <div className="flex flex-col">
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
