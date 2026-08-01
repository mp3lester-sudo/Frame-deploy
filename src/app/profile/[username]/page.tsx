import type { CSSProperties } from "react";
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
import { computeGenreDistribution, buildFingerprintGradient, buildTasteQuote } from "@/lib/profile/taste-fingerprint";
import { resolveProfileTheme } from "@/lib/profile/theme-preset";
import { AnimatedCounter } from "@/components/profile/animated-counter";
import { Reveal } from "@/components/profile/reveal";
import { TiltCard } from "@/components/profile/tilt-card";

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

/** "01", "02", ... -- the pyramid's official-selection numbering, badge
 *  index is the overall favorites rank (0-based), not position within its
 *  own row, so numbering stays continuous across the 1/2/3 podium rows. */
function badgeNumber(overallIndex: number): string {
  return String(overallIndex + 1).padStart(2, "0");
}

/**
 * Selection badge lands like a wax seal being pressed -- a quick
 * overshoot-and-settle stamp (stamp-in) plus a one-shot expanding ring
 * at the moment of impact (seal-ring), instead of a plain pop-in.
 * Reads well regardless of theme, so it's not gated behind
 * theme.showMotif the way the rose/atmosphere flourishes are.
 */
function SelectionBadge({ index, delayMs = 0 }: { index: number; delayMs?: number }) {
  return (
    <span className="absolute -left-2 -top-2 z-30 block h-7 w-7">
      <span
        className="seal-ring pointer-events-none absolute inset-0 rounded-full border border-accent/70"
        style={{ animationDelay: `${delayMs + 260}ms` }}
      />
      <span
        className="stamp-in absolute inset-0 flex items-center justify-center rounded-full border border-accent/60 bg-background font-display text-[11px] italic text-accent shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
        style={{ animationDelay: `${delayMs}ms` }}
      >
        <svg className="absolute inset-0 -rotate-90" width="28" height="28" viewBox="0 0 28 28">
          <circle
            cx="14"
            cy="14"
            r="12.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            className="badge-ring"
            style={{ animationDelay: `${delayMs + 260}ms` }}
          />
        </svg>
        {badgeNumber(index)}
      </span>
    </span>
  );
}

/**
 * Small decorative flourish (rule + rose + rule) shown only by curated
 * profile themes that opt into it (theme.showMotif) -- original line-art,
 * not a reproduction of any film's marketing artwork or logo. Sits above
 * the favorites panel like an engraved invitation card header.
 */
function RoseFlourish() {
  return (
    <div className="mb-5 flex items-center justify-center gap-4 text-accent">
      <span className="rule-grow h-px w-14 bg-gradient-to-r from-transparent to-current opacity-60" />
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        className="rose-icon shrink-0 opacity-90"
      >
        <path d="M12 21V11.5" stroke="currentColor" strokeWidth="1" />
        <path d="M12 15.5c-2 0-3.5-1-3.5-1s.5 2 3.5 2" stroke="currentColor" strokeWidth="1" fill="none" strokeLinecap="round" />
        <path d="M12 17.5c2 0 3.5-1.2 3.5-1.2s-.5 2.2-3.5 2.2" stroke="currentColor" strokeWidth="1" fill="none" strokeLinecap="round" />
        <circle cx="12" cy="7" r="3.2" stroke="currentColor" strokeWidth="1" />
        <circle cx="12" cy="7" r="1.5" stroke="currentColor" strokeWidth="0.75" />
        <path d="M9.1 5.3c.85-.95 1.95-1.5 2.9-1.5s2.05.55 2.9 1.5" stroke="currentColor" strokeWidth="0.75" fill="none" strokeLinecap="round" />
      </svg>
      <span className="rule-grow h-px w-14 bg-gradient-to-l from-transparent to-current opacity-60" />
    </div>
  );
}

/**
 * Background atmosphere for the Godfather theme -- object and light
 * motifs only, deliberately stopping short of any human silhouette or
 * character depiction: a fedora outline resting in the corner, and a
 * cigar with smoke wisps and embers drifting up past it. Positioned
 * low-opacity in the favorites panel's bottom-right corner as texture,
 * not a focal illustration. Purely decorative -- pointer-events-none,
 * aria-hidden.
 */
function PeriodAtmosphere() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute bottom-3 right-4 h-24 w-28 text-accent/25 sm:bottom-4 sm:right-6"
    >
      {/* Fedora outline -- brim + crown, no face or body. */}
      <svg width="64" height="40" viewBox="0 0 64 40" fill="currentColor" className="absolute bottom-0 right-0">
        <ellipse cx="32" cy="30" rx="30" ry="6" />
        <path d="M16 27c0-10 7-19 16-19s16 9 16 19c-4-3-11-4-16-4s-12 1-16 4z" />
      </svg>
      {/* Cigar resting at an angle, ember tip glowing. */}
      <div className="absolute bottom-8 right-8 h-1.5 w-8 -rotate-[24deg] rounded-full bg-current opacity-70" />
      <div className="absolute bottom-[38px] right-[27px] h-1.5 w-1.5 rounded-full bg-[#e8a33d] shadow-[0_0_5px_2px_rgba(232,163,61,0.6)]" />
      {/* Smoke wisps + embers rising from the cigar tip. */}
      <div className="smoke-wisp absolute bottom-10 right-8 h-6 w-2 rounded-full bg-current" style={{ animationDelay: "0s" }} />
      <div className="smoke-wisp absolute bottom-10 right-6 h-5 w-1.5 rounded-full bg-current" style={{ animationDelay: "2s" }} />
      <div className="smoke-wisp absolute bottom-10 right-9 h-4 w-1.5 rounded-full bg-current" style={{ animationDelay: "4s" }} />
      <div className="ember-particle absolute bottom-10 right-7 h-1 w-1 rounded-full bg-[#e8a33d]" style={{ animationDelay: "0.6s" }} />
      <div className="ember-particle absolute bottom-10 right-8 h-1 w-1 rounded-full bg-[#e8a33d]" style={{ animationDelay: "1.8s" }} />
      <div className="ember-particle absolute bottom-10 right-6 h-1 w-1 rounded-full bg-[#e8a33d]" style={{ animationDelay: "2.7s" }} />
    </div>
  );
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

  // Profile theme: a hand-designed palette/type/motif preset keyed to this
  // person's #1 all-time favorite -- see resolveProfileTheme for why this
  // is a narrow curated match rather than a general auto-theming engine.
  const theme = resolveProfileTheme(favorites[0]?.name ?? null);

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

  // Taste fingerprint: the same genreCounts feeding "top genre" above,
  // broken into shares for the wheel graphic, plus a short auto-written
  // line reading the shape of that back to the viewer -- see
  // taste-fingerprint.ts for why this lives as pure, tested functions
  // rather than inline JSX math.
  const genreDistribution = computeGenreDistribution(genreCounts);
  const fingerprintGradient = buildFingerprintGradient(genreDistribution, theme.accentRgb);
  const tierLabel = profile.experience_tier ? EXPERIENCE_TIER_LABEL[profile.experience_tier] : null;
  const tasteQuote = buildTasteQuote(tierLabel, genreDistribution, ratingCount ?? 0);

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
            (hasBanner
              ? "shrink-0 border-8 border-black ring-2 ring-accent/70 shadow-[0_4px_18px_rgba(0,0,0,0.55)]"
              : "shrink-0") + " stagger-card"
          }
        />
        <div className="stagger-card min-w-0 flex-1 pb-1" style={{ animationDelay: "80ms" }}>
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
        <div className="stagger-card flex gap-2 pb-1" style={{ animationDelay: "160ms" }}>
          <div className="shine-hover rounded-[var(--radius-full)]">
            <FollowButton userId={profile.id} initiallyFollowing={!!isFollowing} />
          </div>
          <div className="shine-hover rounded-[var(--radius-full)]">
            <MessageButton userId={profile.id} />
          </div>
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
      {/* Taste fingerprint: a wax-seal-style wheel sized to this person's
          actual genre split (one accent hue at decreasing opacity per
          slice, matching the app's single-accent restraint rather than a
          multi-color pie chart), paired with the auto-written line that
          reads that shape back to them. Only renders once there's real
          rating history to draw from -- see buildTasteQuote. */}
      {tasteQuote && (
        <div className="mb-6 flex items-center gap-4 border-b border-border pb-6">
          <div
            className="wheel-in relative h-20 w-20 shrink-0 rounded-full"
            style={{ background: `conic-gradient(${fingerprintGradient})`, animationDelay: "120ms" }}
          >
            <div className="absolute inset-2 flex items-center justify-center rounded-full bg-background text-center">
              <span className="font-display text-[10px] italic leading-tight text-foreground-muted">
                {tierLabel ?? "Backlot"}
              </span>
            </div>
          </div>
          <div className="stagger-card min-w-0" style={{ animationDelay: "300ms" }}>
            <p className="text-[10px] font-medium uppercase tracking-wider text-foreground-muted">
              Taste fingerprint
            </p>
            <p className="mt-1 font-display text-sm italic leading-snug text-accent">{tasteQuote}</p>
          </div>
        </div>
      )}

      {profile.bio && (
        <div className="stagger-card border-b border-border pb-6" style={{ animationDelay: "360ms" }}>
          <span className="text-[10px] font-medium uppercase tracking-wider text-foreground-muted">About</span>
          <p className="mt-2 text-sm leading-relaxed text-foreground-muted">{profile.bio}</p>
        </div>
      )}

      {/* Ticket-stub stat strip: dashed dividers instead of separate
          boxed tiles, reading like the torn perforation on a real
          admission ticket rather than a generic stats card grid. */}
      <div
        className="stagger-card flex divide-x divide-dashed divide-border rounded-[var(--radius-md)] border border-dashed border-border pt-5 pb-4"
        style={{ animationDelay: "440ms" }}
      >
        <div className="flex-1 px-2 text-center">
          <p className="font-display text-lg"><AnimatedCounter value={ratingCount ?? 0} /></p>
          <p className="text-[9px] uppercase tracking-wider text-foreground-muted">Watched</p>
        </div>
        <div className="flex-1 px-2 text-center">
          <p className="font-display truncate text-lg">{topGenre ?? "—"}</p>
          <p className="text-[9px] uppercase tracking-wider text-foreground-muted">Top genre</p>
        </div>
        <div className="flex-1 px-2 text-center">
          <p className="font-display text-lg"><AnimatedCounter value={followerCount ?? 0} /></p>
          <p className="text-[9px] uppercase tracking-wider text-foreground-muted">Followers</p>
        </div>
        <div className="flex-1 px-2 text-center">
          <p className="font-display text-lg"><AnimatedCounter value={followingCount ?? 0} /></p>
          <p className="text-[9px] uppercase tracking-wider text-foreground-muted">Following</p>
        </div>
      </div>
      {isOwnProfile && (
        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/settings"
            className="stagger-card shine-hover rounded-[var(--radius-full)] bg-accent px-3.5 py-2 text-center text-[11px] font-medium uppercase tracking-wide text-accent-foreground transition-transform duration-200 hover:-translate-y-0.5 hover:brightness-110"
            style={{ animationDelay: "500ms" }}
          >
            Edit profile
          </Link>
          <Link
            href="/taste-dna"
            className="stagger-card shine-hover rounded-[var(--radius-full)] border border-border px-3.5 py-2 text-center text-[11px] font-medium uppercase tracking-wide text-foreground-muted transition-transform duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:text-foreground"
            style={{ animationDelay: "550ms" }}
          >
            Backlot DNA
          </Link>
          <Link
            href="/watchlist"
            className="stagger-card shine-hover rounded-[var(--radius-full)] border border-border px-3.5 py-2 text-center text-[11px] font-medium uppercase tracking-wide text-foreground-muted transition-transform duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:text-foreground"
            style={{ animationDelay: "600ms" }}
          >
            Watchlist
          </Link>
          <Link
            href="/lists"
            className="stagger-card shine-hover rounded-[var(--radius-full)] border border-border px-3.5 py-2 text-center text-[11px] font-medium uppercase tracking-wide text-foreground-muted transition-transform duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:text-foreground"
            style={{ animationDelay: "650ms" }}
          >
            Your lists
          </Link>
        </div>
      )}
    </div>
  );

  return (
    <div style={theme.vars as CSSProperties}>
      {hasBanner ? (
        /* The nav bar is `sticky top-0` -- in normal document flow, not
           an overlay -- so it reserves its own h-14 (56px) of space
           above whatever comes next. Pulling this banner up by that
           same amount (and growing its height to match, same pattern
           as BackdropHero on the movie page) makes the collage extend
           underneath the nav's reserved space instead of stopping right
           below it, so idle-hiding the nav reveals more banner instead
           of a blank gap of page background. */
        <div className="spotlight-sweep relative -mt-14 h-[280px] w-full sm:h-[344px]">
          <div className="absolute inset-0 flex">
            {bannerImages.map((title, i) => (
              <div
                key={title.id}
                className="stagger-card relative flex-1 overflow-hidden"
                style={{ animationDelay: `${i * 90}ms` }}
              >
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
          <div
            className={`relative overflow-hidden rounded-[var(--radius-lg)] border border-border ${theme.showMotif ? "candle-flicker-panel" : ""}`}
          >
            <div
              className="breathe-glow pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse at 50% 30%, rgba(205,166,70,0.08), transparent 70%)",
              }}
            />
            {theme.showMotif && <PeriodAtmosphere />}
            <div className="relative px-6 py-8 sm:px-10 sm:py-10">
              {theme.showMotif && <RoseFlourish />}
              <div className="mb-6 text-center">
                <p
                  className={`text-[10px] font-medium uppercase tracking-[0.2em] text-accent ${theme.showMotif ? "flicker-slow" : ""}`}
                >
                  Official selection
                </p>
                <h2 className="mt-1 text-lg font-semibold">Personal Pyramid</h2>
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
                  <div
                    className="podium-tile relative col-span-2 col-start-3"
                    style={{ animationDelay: "160ms" }}
                  >
                    <TiltCard className="relative rounded-[var(--radius-md)]">
                      <SelectionBadge index={0} delayMs={480} />
                      <div className="polish-sweep pointer-events-none absolute inset-x-0 top-0 z-10 aspect-[2/3] w-full overflow-hidden rounded-[var(--radius-md)]" style={{ animationDelay: "980ms" }} />
                      <TitleCard title={favorites[0]} highlight index={0} />
                    </TiltCard>
                  </div>
                </div>
                {favorites.length > 1 && (
                  <div className="grid grid-cols-6 gap-5">
                    {favorites.slice(1, 3).map((title, i, arr) => {
                      const overallIndex = 1 + i;
                      const tileDelay = 260 + overallIndex * 110;
                      return (
                        <div
                          key={title.id}
                          className={`podium-tile relative col-span-2 ${centeredColStart(arr.length, i)}`}
                          style={{ animationDelay: `${tileDelay}ms` }}
                        >
                          <TiltCard className="relative rounded-[var(--radius-md)]">
                            <SelectionBadge index={overallIndex} delayMs={tileDelay + 320} />
                            <div
                              className="polish-sweep pointer-events-none absolute inset-x-0 top-0 z-10 aspect-[2/3] w-full overflow-hidden rounded-[var(--radius-md)]"
                              style={{ animationDelay: `${tileDelay + 800}ms` }}
                            />
                            <TitleCard title={title} index={overallIndex} />
                          </TiltCard>
                        </div>
                      );
                    })}
                  </div>
                )}
                {favorites.length > 3 && (
                  <div className="grid grid-cols-6 gap-5">
                    {favorites.slice(3, 6).map((title, i, arr) => {
                      const overallIndex = 3 + i;
                      const tileDelay = 260 + overallIndex * 110;
                      return (
                        <div
                          key={title.id}
                          className={`podium-tile relative col-span-2 ${centeredColStart(arr.length, i)}`}
                          style={{ animationDelay: `${tileDelay}ms` }}
                        >
                          <TiltCard className="relative rounded-[var(--radius-md)]">
                            <SelectionBadge index={overallIndex} delayMs={tileDelay + 320} />
                            <div
                              className="polish-sweep pointer-events-none absolute inset-x-0 top-0 z-10 aspect-[2/3] w-full overflow-hidden rounded-[var(--radius-md)]"
                              style={{ animationDelay: `${tileDelay + 800}ms` }}
                            />
                            <TitleCard title={title} index={overallIndex} />
                          </TiltCard>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {compatibility && (
        <Reveal className="mt-6">
          <TasteCompatibilityCard
            compatibility={compatibility}
            otherName={profile.display_name ?? profile.username}
          />
        </Reveal>
      )}

      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Recently watched</h2>
        {(ratingCount ?? 0) > 12 && (
          <Link href={`/profile/${profile.username}/watched`} className="text-sm text-foreground-muted hover:text-foreground">
            See all {ratingCount} &rarr;
          </Link>
        )}
      </div>
      <Reveal className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
        {recentRatings?.map((r, i) => {
          const title = (r as unknown as { titles: Parameters<typeof TitleCard>[0]["title"] }).titles;
          return title ? (
            <WatchedTitleCard
              key={title.id}
              title={title}
              reason={`Rated ${r.score}/5`}
              canRemove={isOwnProfile}
              index={i}
            />
          ) : null;
        })}
      </Reveal>
      </div>

      {rail}
      </div>
    </div>
  );
}
