import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import Image from "@/components/ui/fade-image";
import { Avatar } from "@/components/ui/avatar";
import { TitleCard } from "@/components/title-card";
import { WatchedTitleCard } from "@/components/profile/watched-title-card";
import { FollowButton } from "@/components/follow-button";
import { MessageButton } from "@/components/message-button";
import { computeCompatibilityForUsers } from "@/lib/matchmaking/compute";
import { TasteCompatibilityCard } from "@/components/taste-compatibility-card";
import { EXPERIENCE_TIER_LABEL } from "@/lib/constants/experience-tier";

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

  const viewer = await getVerifiedUser();

  const resolvedUsername = username === "me" && viewer ? null : username;

  const { data: profile } = resolvedUsername
    ? await supabase.from("profiles").select("*").eq("username", resolvedUsername).maybeSingle()
    : await supabase.from("profiles").select("*").eq("id", viewer?.id ?? "").maybeSingle();

  if (!profile) notFound();

  const isOwnProfile = viewer?.id === profile.id;
  const compatibility =
    viewer && !isOwnProfile ? await computeCompatibilityForUsers(viewer.id, profile.id) : null;

  const [
    { count: followerCount },
    { count: followingCount },
    { data: recentRatings },
    { count: ratingCount },
    { data: isFollowing },
    { data: favoriteRows },
    { data: genreRows },
  ] = await Promise.all([
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("followee_id", profile.id),
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", profile.id),
    supabase
      .from("ratings")
      .select("score, titles(*)")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(12),
    // Separate count so "See all" only shows up when there's actually
    // more than the 12-item teaser above already covers.
    supabase.from("ratings").select("*", { count: "exact", head: true }).eq("user_id", profile.id),
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
    // Lightweight, genres-only fetch across this person's ENTIRE rating
    // history (not just the 12-item "recently watched" teaser above) --
    // computed fresh from ratings + titles rather than read from
    // taste_attributes.favorite_genres, since that column is only
    // best-effort populated once someone's visited a page that calls
    // computeTasteDna and would otherwise leave this stat blank for a
    // lot of profiles that clearly do have a most-watched genre.
    supabase.from("ratings").select("titles(genres)").eq("user_id", profile.id),
  ]);

  const favorites = (favoriteRows ?? [])
    .map((r) => (r as unknown as { titles: Parameters<typeof TitleCard>[0]["title"] | null }).titles)
    .filter((t): t is Parameters<typeof TitleCard>[0]["title"] => !!t);

  // Most-watched genre across this profile's whole rating history, not
  // just the recent-ratings teaser -- a simple frequency count across
  // every genre tag on every rated title, ties broken by insertion
  // order (first genre to reach the max count wins), which is plenty
  // for a single "top genre" banner stat.
  const genreCounts = new Map<string, number>();
  for (const row of genreRows ?? []) {
    const genres = (row as unknown as { titles: { genres: string[] } | null }).titles?.genres ?? [];
    for (const genre of genres) {
      genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
    }
  }
  let topGenre: string | null = null;
  let topGenreCount = 0;
  for (const [genre, count] of genreCounts) {
    if (count > topGenreCount) {
      topGenre = genre;
      topGenreCount = count;
    }
  }

  // Editorial cover-photo banner (Option B from the profile redesign
  // exploration, since refined for legibility/scale/cohesion): a
  // collage of this person's own favorite titles stands in for a
  // "cover photo," full-bleed across the page like the home page's
  // featured-banner hero. Uses each title's backdrop art (landscape key
  // art, same source as the movie page's own hero) rather than
  // poster_url -- the podium right below already shows every favorite
  // as a portrait poster, so reusing that same art here would just look
  // like a second, blurrier copy of the same image. Falls back to
  // poster_url only for the rare title with no backdrop, and to a flat
  // header (no banner) when there aren't enough favorites to build a
  // collage.
  //
  // Sized taller than the earlier pass (h-56/h-72 vs the original
  // h-28/h-36) now that it spans the full page width -- at the old
  // height it read as a thin, easy-to-miss stripe rather than a real
  // cover photo. Identity content (avatar/name/stats/buttons) is
  // overlaid at the bottom of the banner via the same bottom-anchored
  // gradient-fade pattern as the home page hero, rather than sitting
  // separately below it, so banner and header read as one unified
  // block instead of two disconnected pieces. Bio stays below the
  // banner in normal flow since it's variable-height text that
  // wouldn't reliably land in the gradient's legible zone.
  const bannerImages = favorites
    .map((t) => ({ id: t.id, name: t.name, image: t.backdrop_url ?? t.poster_url }))
    .filter((t): t is { id: string; name: string; image: string } => !!t.image)
    .slice(0, 5);
  const hasBanner = bannerImages.length > 0;

  // Editorial two-column layout (Option A): the banner overlay now only
  // carries pure identity (avatar/name/tier/username) plus the one
  // primary action a visitor actually needs immediately -- Follow/
  // Message. Everything that used to compete for space in this same
  // overlay row (watched/top-genre pills, the four-link self-service
  // row) has moved down into the right rail below, next to bio and
  // stats, mirroring the home page's own main-column/rail split so the
  // two most-visited pages in the app share the same reading pattern.
  const identityBlock = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-end gap-4">
        <Avatar
          name={profile.display_name ?? profile.username}
          src={profile.avatar_url}
          size={88}
          className={
            hasBanner
              ? "shrink-0 border-8 border-black ring-2 ring-accent/70 shadow-[0_4px_18px_rgba(0,0,0,0.55)]"
              : "shrink-0"
          }
        />
        <div className="min-w-0 flex-1 pb-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-xl">{profile.display_name ?? profile.username}</h1>
            {profile.experience_tier && (
              <span className="rounded-[var(--radius-full)] border border-accent/50 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
                {EXPERIENCE_TIER_LABEL[profile.experience_tier]}
              </span>
            )}
          </div>
          <p className="text-sm text-foreground-muted">@{profile.username}</p>
        </div>
      </div>
      {viewer && !isOwnProfile && (
        <div className="flex gap-2 pb-1">
          <FollowButton userId={profile.id} initiallyFollowing={!!isFollowing} />
          <MessageButton userId={profile.id} />
        </div>
      )}
    </div>
  );

  // Right rail: bio, then a 2x2 stat grid (watched / top genre /
  // followers / following -- previously split awkwardly between plain
  // text and pills up in the banner overlay), then the self-service
  // links row (Edit profile / Backlot DNA / Watchlist / Your lists),
  // now stacked as a real vertical menu instead of squeezed pills that
  // had to share a row with the follow-stats text.
  const rail = (
    <div className="mt-8 lg:mt-0">
      {profile.bio && (
        <div className="border-b border-border pb-6">
          <span className="text-[10px] font-medium uppercase tracking-wider text-foreground-muted">About</span>
          <p className="mt-2 text-sm leading-relaxed text-foreground-muted">{profile.bio}</p>
        </div>
      )}
      <div className={profile.bio ? "grid grid-cols-2 gap-3 pt-6" : "grid grid-cols-2 gap-3"}>
        <div className="rounded-[var(--radius-md)] bg-surface-raised px-4 py-3">
          <p className="font-display text-lg">{ratingCount ?? 0}</p>
          <p className="text-[10px] uppercase tracking-wider text-foreground-muted">Watched</p>
        </div>
        <div className="rounded-[var(--radius-md)] bg-surface-raised px-4 py-3">
          <p className="font-display truncate text-lg">{topGenre ?? "—"}</p>
          <p className="text-[10px] uppercase tracking-wider text-foreground-muted">Top genre</p>
        </div>
        <div className="rounded-[var(--radius-md)] bg-surface-raised px-4 py-3">
          <p className="font-display text-lg">{followerCount ?? 0}</p>
          <p className="text-[10px] uppercase tracking-wider text-foreground-muted">Followers</p>
        </div>
        <div className="rounded-[var(--radius-md)] bg-surface-raised px-4 py-3">
          <p className="font-display text-lg">{followingCount ?? 0}</p>
          <p className="text-[10px] uppercase tracking-wider text-foreground-muted">Following</p>
        </div>
      </div>
      {isOwnProfile && (
        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/settings"
            className="rounded-[var(--radius-full)] bg-accent px-3.5 py-2 text-center text-[11px] font-medium uppercase tracking-wide text-accent-foreground hover:brightness-110"
          >
            Edit profile
          </Link>
          <Link
            href="/taste-dna"
            className="rounded-[var(--radius-full)] border border-border px-3.5 py-2 text-center text-[11px] font-medium uppercase tracking-wide text-foreground-muted hover:border-border-strong hover:text-foreground"
          >
            Backlot DNA
          </Link>
          <Link
            href="/watchlist"
            className="rounded-[var(--radius-full)] border border-border px-3.5 py-2 text-center text-[11px] font-medium uppercase tracking-wide text-foreground-muted hover:border-border-strong hover:text-foreground"
          >
            Watchlist
          </Link>
          <Link
            href="/lists"
            className="rounded-[var(--radius-full)] border border-border px-3.5 py-2 text-center text-[11px] font-medium uppercase tracking-wide text-foreground-muted hover:border-border-strong hover:text-foreground"
          >
            Your lists
          </Link>
        </div>
      )}
    </div>
  );

  return (
    <div>
      {hasBanner ? (
        /* The nav bar is `sticky top-0` -- in normal document flow, not
           an overlay -- so it reserves its own h-14 (56px) of space
           above whatever comes next. Pulling this banner up by that
           same amount (and growing its height to match, same pattern
           as BackdropHero on the movie page) makes the collage extend
           underneath the nav's reserved space instead of stopping right
           below it, so idle-hiding the nav reveals more banner instead
           of a blank gap of page background. */
        <div className="relative -mt-14 h-[280px] w-full sm:h-[344px]">
          <div className="absolute inset-0 flex">
            {bannerImages.map((title) => (
              <div key={title.id} className="relative flex-1 overflow-hidden">
                <Image
                  src={title.image}
                  alt=""
                  fill
                  className="object-cover object-top"
                  sizes="400px"
                />
              </div>
            ))}
          </div>
          {/* Bottom-anchored fade only -- same via-background/70 strength
              used by the trailer hero's own fade -- so the collage stays
              clearly visible up top instead of the near-invisible wash
              the first pass had, while the overlaid identity content at
              the very bottom still lands on a fully opaque backdrop. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background via-background/70 to-transparent sm:h-48" />
          <div className="absolute inset-x-0 bottom-0 mx-auto max-w-4xl px-4 pb-4 sm:px-6">{identityBlock}</div>
        </div>
      ) : (
        <div className="mx-auto max-w-4xl px-4 pt-8">{identityBlock}</div>
      )}

      <div className="mx-auto max-w-6xl px-4 pb-8 pt-6 lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start lg:gap-10">
      <div>
      {favorites.length > 0 && (
        <div className="mt-0">
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
              <div className="mb-6 text-center">
                <h2 className="text-lg font-semibold">Personal Pyramid</h2>
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

      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Recently watched</h2>
        {(ratingCount ?? 0) > 12 && (
          <Link href={`/profile/${profile.username}/watched`} className="text-sm text-foreground-muted hover:text-foreground">
            See all {ratingCount} &rarr;
          </Link>
        )}
      </div>
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

      {rail}
      </div>
    </div>
  );
}
