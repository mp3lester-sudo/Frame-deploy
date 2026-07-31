import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { WatchedGrid } from "@/components/profile/watched-grid";
import { WATCHED_PAGE_SIZE } from "@/lib/constants/catalogue";
import type { Database } from "@/lib/supabase/types";

type Title = Database["public"]["Tables"]["titles"]["Row"];

/**
 * Full, paginated version of the profile page's "Recently watched" teaser
 * (which hard-caps at 12 — see src/app/profile/[username]/page.tsx). Same
 * "me" resolution as the parent profile page so /profile/me/watched works
 * for the signed-in viewer without needing their own username.
 */
export default async function WatchedPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const supabase = await createClient();

  const viewer = await getVerifiedUser();
  const resolvedUsername = username === "me" && viewer ? null : username;

  const { data: profile } = resolvedUsername
    ? await supabase.from("profiles").select("id, username, display_name").eq("username", resolvedUsername).maybeSingle()
    : await supabase.from("profiles").select("id, username, display_name").eq("id", viewer?.id ?? "").maybeSingle();

  if (!profile) notFound();

  const isOwnProfile = viewer?.id === profile.id;

  // Same tiebreaker as loadMoreWatchedTitles (src/lib/actions/watched.ts) —
  // must match exactly so page 1 here and page 2+ from "Load more" agree on
  // ordering.
  const { data } = await supabase
    .from("ratings")
    .select("score, titles(*)")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(0, WATCHED_PAGE_SIZE - 1);

  const rows = (data ?? [])
    .map((r) => {
      const title = (r as unknown as { titles: Title | null }).titles;
      return title ? { score: r.score, title } : null;
    })
    .filter((r): r is { score: number; title: Title } => r !== null);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link href={`/profile/${profile.username}`} className="text-sm text-foreground-muted hover:text-foreground">
        &larr; Back to profile
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">
        {isOwnProfile ? "Everything you've watched" : `Everything ${profile.display_name ?? profile.username} has watched`}
      </h1>

      <WatchedGrid
        username={profile.username}
        isOwnProfile={isOwnProfile}
        initialRows={rows}
        initialHasMore={rows.length === WATCHED_PAGE_SIZE}
      />
    </div>
  );
}
