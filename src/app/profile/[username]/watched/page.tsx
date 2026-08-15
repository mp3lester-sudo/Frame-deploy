import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { WatchedGrid } from "@/components/profile/watched-grid";
import { WATCHED_PAGE_SIZE } from "@/lib/constants/catalogue";
import type { Database } from "@/lib/supabase/types";
import { getActiveMediaType } from "@/lib/context/media-type";

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

  // Scoped to the active Movies/Shows toggle -- this page used to mix
  // movies and TV ratings together with no filter at all, the one place
  // in the app that still did after every other feature (Discover, Home,
  // Movie Night, Wrapped, Taste DNA, Watchlist, the Pyramid) got split by
  // media_type. titles!inner scopes the join itself so the count query
  // below stays correct too, not just the display rows.
  const mediaType = await getActiveMediaType();

  // Same tiebreaker as loadMoreWatchedTitles (src/lib/actions/watched.ts) —
  // must match exactly so page 1 here and page 2+ from "Load more" agree on
  // ordering.
  const [{ data }, { count }] = await Promise.all([
    supabase
      .from("ratings")
      .select("score, titles!inner(*)")
      .eq("user_id", profile.id)
      .eq("titles.type", mediaType)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(0, WATCHED_PAGE_SIZE - 1),
    // Cheap head-only count, used purely as a cache-invalidation signal —
    // see usePersistedPagination's `version` param. Without this, a bulk
    // import landing after a visitor's last page view would leave the
    // grid stuck showing whatever was cached in sessionStorage from
    // before the import, with no way to reach the new rows short of
    // clearing storage or opening a new tab. Also type-scoped now, for
    // the same reason the main query above is -- an unscoped count would
    // silently break the invalidation signal itself the moment a viewer
    // has ratings of both types (the version string would stay "47"
    // across a Movies<->Shows toggle even though the actual Movies-only
    // or Shows-only row count is a different, smaller number).
    supabase
      .from("ratings")
      .select("id, titles!inner(type)", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .eq("titles.type", mediaType),
  ]);

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
      <h1 className="font-display mt-3 text-2xl">
        {isOwnProfile ? "Everything you've watched" : `Everything ${profile.display_name ?? profile.username} has watched`}
      </h1>

      <WatchedGrid
        key={mediaType}
        username={profile.username}
        mediaType={mediaType}
        isOwnProfile={isOwnProfile}
        initialRows={rows}
        initialHasMore={rows.length === WATCHED_PAGE_SIZE}
        totalCount={count ?? rows.length}
      />
    </div>
  );
}
