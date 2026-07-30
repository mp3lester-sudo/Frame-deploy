import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/ui/avatar";
import { TitleCard } from "@/components/title-card";
import { WatchedTitleCard } from "@/components/profile/watched-title-card";
import { FollowButton } from "@/components/follow-button";
import { MessageButton } from "@/components/message-button";
import { computeCompatibilityForUsers } from "@/lib/matchmaking/compute";
import { TasteCompatibilityCard } from "@/components/taste-compatibility-card";

/**
 * Tailwind col-start-N classes must appear literally in source for the JIT
 * scanner to pick them up, so this returns full class strings rather than
 * building "col-start-" + n. Centers a row of 1, 2, or 3 tiles (each
 * spanning 2 of 6 grid columns) so partial favorite lists still look
 * deliberate instead of left-aligned.
 */
function centeredColStart(count: number, index: number): string {
  if (count === 1) return "col-start-3";
  if (count === 2) return index === 0 ? "col-start-2" : "col-start-4";
  return index === 0 ? "col-start-1" : index === 1 ? "col-start-3" : "col-start-5";
}

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const supabase = await createClient();

  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();

  const resolvedUsername = username === "me" && viewer ? null : username;

  const { data: profile } = resolvedUsername
    ? await supabase.from("profiles").select("*").eq("username", resolvedUsername).maybeSingle()
    : await supabase.from("profiles").select("*").eq("id", viewer?.id ?? "").maybeSingle();

  if (!profile) notFound();

  const isOwnProfile = viewer?.id === profile.id;
  const compatibility =
    viewer && !isOwnProfile ? await computeCompatibilityForUsers(viewer.id, profile.id) : null;

  const [{ count: followerCount }, { count: followingCount }, { data: recentRatings }, { data: isFollowing }, { data: favoriteRows }] =
    await Promise.all([
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("followee_id", profile.id),
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", profile.id),
      supabase
        .from("ratings")
        .select("score, titles(*)")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(12),
      viewer
        ? supabase
            .from("follows")
            .select("*")
            .eq("follower_id", viewer.id)
            .eq("followee_id", profile.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("favorite_titles")
        .select("position, titles(*)")
        .eq("user_id", profile.id)
        .order("position", { ascending: true }),
    ]);

  const favorites = (favoriteRows ?? [])
    .map((r) => (r as unknown as { titles: Parameters<typeof TitleCard>[0]["title"] | null }).titles)
    .filter((t): t is Parameters<typeof TitleCard>[0]["title"] => !!t);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex items-center gap-4">
        <Avatar name={profile.display_name ?? profile.username} src={profile.avatar_url} size={64} />
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{profile.display_name ?? profile.username}</h1>
          <p className="text-sm text-foreground-muted">@{profile.username}</p>
          <p className="mt-1 text-sm text-foreground-muted">
            {followerCount ?? 0} followers · {followingCount ?? 0} following
          </p>
        </div>
        {viewer && !isOwnProfile && (
          <div className="flex gap-2">
            <FollowButton userId={profile.id} initiallyFollowing={!!isFollowing} />
            <MessageButton userId={profile.id} />
          </div>
        )}
        {isOwnProfile && (
          <div className="flex flex-col items-end gap-1">
            <Link href="/settings" className="text-xs uppercase tracking-wider text-accent hover:brightness-110">
              Edit profile
            </Link>
            <Link
              href="/taste-dna"
              className="text-xs uppercase tracking-wider text-foreground-muted hover:text-accent"
            >
              View Taste DNA &rarr;
            </Link>
            <Link
              href="/watchlist"
              className="text-xs uppercase tracking-wider text-foreground-muted hover:text-accent"
            >
              Watchlist &rarr;
            </Link>
            <Link
              href="/lists"
              className="text-xs uppercase tracking-wider text-foreground-muted hover:text-accent"
            >
              Your lists &rarr;
            </Link>
          </div>
        )}
      </div>

      {profile.bio && <p className="mt-4 text-sm leading-relaxed">{profile.bio}</p>}

      {favorites.length > 0 && (
        <div className="mt-6">
          {/* The podium used to sit directly on the page background at a
              narrow 480px width, which read as an accidentally small
              widget stranded in a lot of empty page rather than a
              deliberate section. Wrapping it in a bordered panel (with a
              faint gold glow behind it) gives the surrounding space a
              reason to exist — it's the panel's padding, not dead air —
              and widening the panel lets every tile scale up with it. */}
          <div className="relative overflow-hidden rounded-[var(--radius-lg)] border border-border">
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse at 50% 30%, rgba(205,166,70,0.08), transparent 70%)",
              }}
            />
            <div className="relative px-6 py-8 sm:px-10 sm:py-10">
              <div className="mb-6 flex items-baseline justify-between">
                <h2 className="text-lg font-semibold">Favorites</h2>
                <span className="text-xs text-foreground-muted">
                  {favorites.length} all-time pick{favorites.length === 1 ? "" : "s"}
                </span>
              </div>

              {/* 3-2-1 podium: rank comes from POSITION (alone on top, pair
                  in the middle, trio on the bottom), not from size — every
                  tile is the same width. Each row is its own 6-column grid
                  so a row of 1, 2, or 3 all resolve to identical column
                  widths (2 of 6 columns per tile) and stay centered
                  regardless of tier. */}
              <div className="mx-auto flex max-w-[560px] flex-col gap-5">
                <div className="grid grid-cols-6 gap-5">
                  <div className="col-span-2 col-start-3">
                    <TitleCard title={favorites[0]} highlight />
                  </div>
                </div>
                {favorites.length > 1 && (
                  <div className="grid grid-cols-6 gap-5">
                    {favorites.slice(1, 3).map((title, i, arr) => (
                      <div
                        key={title.id}
                        className={`col-span-2 ${centeredColStart(arr.length, i)}`}
                      >
                        <TitleCard title={title} />
                      </div>
                    ))}
                  </div>
                )}
                {favorites.length > 3 && (
                  <div className="grid grid-cols-6 gap-5">
                    {favorites.slice(3, 6).map((title, i, arr) => (
                      <div
                        key={title.id}
                        className={`col-span-2 ${centeredColStart(arr.length, i)}`}
                      >
                        <TitleCard title={title} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {compatibility && (
        <div className="mt-6">
          <TasteCompatibilityCard
            compatibility={compatibility}
            otherName={profile.display_name ?? profile.username}
          />
        </div>
      )}

      <h2 className="mb-3 mt-8 text-lg font-semibold">Recently watched</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
        {recentRatings?.map((r) => {
          const title = (r as unknown as { titles: Parameters<typeof TitleCard>[0]["title"] }).titles;
          return title ? (
            <WatchedTitleCard
              key={title.id}
              title={title}
              reason={`Rated ${r.score}/5`}
              canRemove={isOwnProfile}
            />
          ) : null;
        })}
      </div>
    </div>
  );
}
