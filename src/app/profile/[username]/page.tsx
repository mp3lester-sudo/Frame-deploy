import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/ui/avatar";
import { TitleCard } from "@/components/title-card";
import { FollowButton } from "@/components/follow-button";
import { computeCompatibilityForUsers } from "@/lib/matchmaking/compute";

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

  const [{ count: followerCount }, { count: followingCount }, { data: recentRatings }, { data: isFollowing }] =
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
    ]);

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
        {viewer && !isOwnProfile && <FollowButton userId={profile.id} initiallyFollowing={!!isFollowing} />}
        {isOwnProfile && (
          <Link
            href="/taste-dna"
            className="text-xs uppercase tracking-wider text-accent hover:brightness-110"
          >
            View Taste DNA &rarr;
          </Link>
        )}
      </div>

      {profile.bio && <p className="mt-4 text-sm leading-relaxed">{profile.bio}</p>}

      {compatibility && compatibility.hasEnoughData && (
        <div className="mt-6 rounded-[var(--radius-md)] border border-border bg-surface p-4">
          <p className="font-display text-lg">
            You and {profile.display_name ?? profile.username} are{" "}
            <span className="text-accent">{compatibility.percent}%</span> compatible
          </p>
          {compatibility.sharedFavoriteGenres.length > 0 && (
            <p className="mt-2 text-sm text-foreground-muted">
              You both love: {compatibility.sharedFavoriteGenres.join(", ")}
            </p>
          )}
          {compatibility.sharedFavoriteDirectors.length > 0 && (
            <p className="mt-1 text-sm text-foreground-muted">
              You both rank {compatibility.sharedFavoriteDirectors.map((d) => d.name).join(", ")} among your
              favorite directors
            </p>
          )}
          {compatibility.biggestDisagreementGenre && (
            <p className="mt-1 text-sm text-foreground-muted">
              Your biggest disagreement: {compatibility.biggestDisagreementGenre}
            </p>
          )}
        </div>
      )}

      {compatibility && !compatibility.hasEnoughData && (
        <p className="mt-6 text-xs text-foreground-muted">
          Not enough ratings from both of you yet to compute compatibility.
        </p>
      )}

      <h2 className="mb-3 mt-8 text-lg font-semibold">Recently watched</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
        {recentRatings?.map((r) => {
          const title = (r as unknown as { titles: Parameters<typeof TitleCard>[0]["title"] }).titles;
          return title ? <TitleCard key={title.id} title={title} reason={`Rated ${r.score}/5`} /> : null;
        })}
      </div>
    </div>
  );
}
