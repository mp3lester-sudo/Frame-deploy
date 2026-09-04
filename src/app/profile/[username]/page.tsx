import type { CSSProperties } from "react";
import { cache } from "react";
import { Settings, Bookmark, ListChecks } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { getActiveMediaType } from "@/lib/context/media-type";
import { BANNER_DUOTONE_FILTER } from "@/lib/design/duotone";
import Image from "@/components/ui/fade-image";
import { Avatar } from "@/components/ui/avatar";
import { TitleCard } from "@/components/title-card";
import { WatchedTitleCard } from "@/components/profile/watched-title-card";
import { FollowButton } from "@/components/follow-button";
import { MessageButton } from "@/components/message-button";
import { BlockUserButton } from "@/components/moderation/block-user-button";
import { ReportButton } from "@/components/moderation/report-button";
import { computeCompatibilityForUsers } from "@/lib/matchmaking/compute";
import { TasteCompatibilityCard } from "@/components/taste-compatibility-card";
import { EXPERIENCE_TIER_LABEL } from "@/lib/constants/experience-tier";
import { computeCinemaPoints, letterGradeForPoints, tierForPoints } from "@/lib/profile/cinema-score";
import { CinemaScoreSeal } from "@/components/profile/cinema-score-seal";
import { computeGenreDistribution, buildFingerprintGradient, buildTasteQuote } from "@/lib/profile/taste-fingerprint";
import { resolveTheme } from "@/lib/profile/theme-preset";
import { isAuteurActive } from "@/lib/premium/tier";
import { AnimatedCounter } from "@/components/profile/animated-counter";
import { Reveal } from "@/components/profile/reveal";
import { TiltCard } from "@/components/profile/tilt-card";
import { computeTasteDna, computeWrapped } from "@/lib/taste-dna/compute";
import { computeSignaturePick } from "@/lib/taste-dna/signature-pick";
import { withTimeout } from "@/lib/with-timeout";
import { MIN_SAMPLE_SIZE, PACING_LABEL } from "@/lib/taste-dna/labels";
import { SignaturePickCard } from "@/components/taste-dna/signature-pick-card";
import { ArchetypeBar } from "@/components/taste-dna/archetype-bar";
import { HideOnNative } from "@/components/native/hide-on-native";
import { ShowOnNative } from "@/components/native/show-on-native";
import type { Database } from "@/lib/supabase/types";

// TitleCard's own prop type (GridTitle, see title-card.tsx) is
// deliberately narrower than a full titles row now -- these two spots
// below read fields off favorite/recently-watched titles (backdrop_url
// for the banner collage, and everything WatchedTitleCard needs) beyond
// what TitleCard itself renders, so they need the real full-row type
// rather than piggybacking on TitleCard's prop type the way this file
// used to.
type FullTitleRow = Database["public"]["Tables"]["titles"]["Row"];

/** Auteur subscribers get the fuller evolution read (more rising/fading
 *  archetype insights per direction) on this page too, matching the
 *  standalone /taste-dna page's own Auteur-vs-standard split (task
 *  #343). Free/Premium keep evolution.ts's own default cap. */
const AUTEUR_MAX_ARCHETYPE_INSIGHTS = 6;

/**
 * Duotone recipe for the favorites-backdrop banner (see the Image
 * style comment further down for the full "why"). Two separate
 * recipes, not one hue-rotate value shared across modes -- the same
 * gold recipe pushed through hue-rotate lands on a saturated cyan/teal,
 * which globals.css explicitly moved away from for Shows mode ("Cold
 * open" direction: icy slate-blue toward near-black, pale ice-white
 * accent rather than a saturated hue -- "superseded an earlier cyan/
 * teal pass"). So Shows gets its own lower-saturation, cooler-and-
 * brighter recipe tuned to land near --tv-accent-deep's actual muted
 * slate-blue instead of just algebraically rotating gold's hue.
 */
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

// Wrapped in React's cache() so generateMetadata (below) and the page
// component further down -- which both need this same profile row --
// share one Supabase round trip per request instead of two. Full
// select("*") rather than a metadata-only slim column set: the page
// component needs every column anyway, and generateMetadata only reads
// a handful of fields off the same row.
const getProfileByUsername = cache(async (username: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("username", username).maybeSingle();
  return data;
});

// Separate cache key from getProfileByUsername above -- the "/profile/me"
// alias resolves by the viewer's own id instead of a username (see
// resolvedUsername below), a genuinely different lookup, not a dedupe
// target with the username-keyed fetch.
const getProfileById = cache(async (id: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  return data;
});

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  // The "/profile/me" alias is viewer-relative and not a stable, shareable
  // URL, so it's excluded from search indexing rather than generating
  // metadata for whoever happens to be logged in when a crawler hits it.
  if (username === "me") return { robots: { index: false, follow: false } };

  const profile = await getProfileByUsername(username);
  if (!profile) return { title: "Profile not found" };

  const name = profile.display_name ?? profile.username;
  const description = profile.bio?.slice(0, 200) || `${name}'s taste profile on Slate.`;

  return {
    title: `${name} (@${profile.username})`,
    description,
    openGraph: {
      title: `${name} (@${profile.username})`,
      description,
      images: profile.avatar_url ? [{ url: profile.avatar_url }] : undefined,
    },
    twitter: {
      card: "summary",
      title: `${name} (@${profile.username})`,
      description,
    },
  };
}

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const supabase = await createClient();

  const viewer = await getVerifiedUser();

  const resolvedUsername = username === "me" && viewer ? null : username;

  const profile = resolvedUsername
    ? await getProfileByUsername(resolvedUsername)
    : await getProfileById(viewer?.id ?? "");

  if (!profile) notFound();

  const isOwnProfile = viewer?.id === profile.id;
  // "Fully separate profiles" -- every stat/section below (DNA, Wrapped,
  // Cinema Score, Personal Pyramid, compatibility) is scoped to whichever
  // toggle the VIEWER currently has active, same convention Discover/Home
  // already use app-wide (a single global mode, not a per-page switch).
  const mediaType = await getActiveMediaType();
  // Kicked off here (not awaited) so it runs concurrently with
  // dnaPromise/signaturePickPromise/wrappedPromise below instead of
  // blocking them from even starting -- this used to be a direct await
  // sitting in front of all three, serializing the compatibility RPC
  // ahead of everything else on every non-own-profile view.
  const compatibilityPromise =
    viewer && !isOwnProfile ? computeCompatibilityForUsers(viewer.id, profile.id, mediaType) : Promise.resolve(null);

  // Slate DNA used to live behind its own link in the self-service menu
  // (viewer's own DNA only, at /taste-dna); it now renders inline right
  // next to the Personal Pyramid instead, scoped to THIS profile (not the
  // viewer) so it's public the same way the pyramid and stats already are.
  // Kicked off here (not awaited yet) so it runs concurrently with the big
  // Promise.all below rather than adding its own sequential round trip.
  // computeSignaturePick is timeout-guarded (see its own comment in
  // taste-dna/page.tsx) since this panel is now on a far more frequently
  // visited page than the standalone Taste DNA page ever was.
  // Computed here (not just down by the Auteur badge) so it can also
  // scale the Taste DNA evolution insight count for Auteur subscribers --
  // see AUTEUR_MAX_ARCHETYPE_INSIGHTS above.
  const isAuteur = isAuteurActive(profile);
  const dnaPromise = computeTasteDna(
    profile.id,
    mediaType,
    isAuteur ? AUTEUR_MAX_ARCHETYPE_INSIGHTS : undefined
  );
  const signaturePickPromise = withTimeout(computeSignaturePick(profile.id, mediaType), 10000, null);
  // Wrapped preview card (own profile only -- see the rail below): kicked
  // off here for the same reason as the other two -- runs concurrently
  // with the big Promise.all rather than adding its own sequential round
  // trip. "This year so far" mirrors the default the standalone /wrapped
  // page itself shows before you page back through past years.
  const wrappedPromise = isOwnProfile
    ? computeWrapped(profile.id, mediaType, new Date().getUTCFullYear())
    : Promise.resolve(null);

  const [
    { count: followerCount },
    { count: followingCount },
    { data: recentRatings },
    { count: ratingCount },
    { data: isFollowing },
    { data: favoriteRows },
    { data: genreRows },
    { data: blockRow },
    { data: cinemaScoreRow },
  ] = await Promise.all([
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("followee_id", profile.id),
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", profile.id),
    supabase
      .from("ratings")
      .select("score, titles!inner(*)")
      .eq("user_id", profile.id)
      .eq("titles.type", mediaType)
      .order("created_at", { ascending: false })
      .limit(12),
    // Separate count so "See all" only shows up when there's actually
    // more than the 12-item teaser above already covers.
    supabase
      .from("ratings")
      .select("*, titles!inner(type)", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .eq("titles.type", mediaType),
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
      .eq("media_type", mediaType)
      .order("position", { ascending: true }),
    // Lightweight, genres-only fetch across this person's ENTIRE rating
    // history (not just the 12-item "recently watched" teaser above) --
    // computed fresh from ratings + titles rather than read from
    // taste_attributes.favorite_genres, since that column is only
    // best-effort populated once someone's visited a page that calls
    // computeTasteDna and would otherwise leave this stat blank for a
    // lot of profiles that clearly do have a most-watched genre.
    supabase.from("ratings").select("titles!inner(genres)").eq("user_id", profile.id).eq("titles.type", mediaType),
    viewer
      ? supabase
          .from("user_blocks")
          .select("blocker_id")
          .eq("blocker_id", viewer.id)
          .eq("blocked_id", profile.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    // Cinema Score: an earned rookie/intermediate/pro tier computed from
    // this profile's own watching/reviewing activity (see
    // src/lib/profile/cinema-score.ts and migration 0040) -- replaces
    // what used to be a self-reported pick stored on profiles.experience_tier.
    // Called directly here (not via the getCinemaScore action, which
    // re-derives the caller's own session) since this render already has
    // a verified user and a live supabase client from further up this
    // same function -- re-authenticating again per the same "redundant
    // auth.getUser() calls" fix applied elsewhere on this page.
    supabase.rpc("compute_cinema_score", { p_user_id: profile.id, p_media_type: mediaType }).maybeSingle(),
  ]);

  const [dna, signaturePick, wrapped, compatibility] = await Promise.all([
    dnaPromise,
    signaturePickPromise,
    wrappedPromise,
    compatibilityPromise,
  ]);

  const favorites = (favoriteRows ?? [])
    .map((r) => (r as unknown as { titles: FullTitleRow | null }).titles)
    .filter((t): t is FullTitleRow => !!t);

  // Profile theme: an exact-title curated preset (e.g. a #1 favorite of
  // "The Godfather") takes priority when present; otherwise the person's
  // own dominant Taste DNA archetype (dna.archetypes, already computed
  // above for the DNA panel -- no extra query) drives a general
  // taste-based palette. See theme-preset.ts for the full two-tier
  // resolution and why this stays a small curated set rather than a
  // color-extraction engine.
  const theme = resolveTheme({
    topFavoriteName: favorites[0]?.name ?? null,
    archetypes: dna.archetypes,
    sampleSize: dna.sampleSize,
  });

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
  // Cinema Score points, recomputed here from the raw watched/reviewed
  // counts (rather than trusting the RPC's own points column blindly) so
  // the tier math stays in one place -- src/lib/profile/cinema-score.ts --
  // instead of duplicated between SQL and TypeScript.
  const cinemaPoints = computeCinemaPoints(cinemaScoreRow?.watched_count ?? 0, cinemaScoreRow?.reviewed_count ?? 0);
  const cinemaTier = tierForPoints(cinemaPoints);
  // Letter grade (A+ through F) is what actually renders on the stat
  // strip below -- see letterGradeForPoints's doc comment in
  // cinema-score.ts for why the raw points total isn't shown directly.
  const cinemaGrade = letterGradeForPoints(cinemaPoints);
  const tierLabel = EXPERIENCE_TIER_LABEL[cinemaTier];
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
  // The collage's own middle slot is left plain (just the app's
  // background, no movie still) so the avatar can sit centered in the
  // banner without competing with a title image directly behind it.
  const bannerAvatarIndex = Math.floor(bannerImages.length / 2);

  // Editorial two-column layout (Option A), now centered under the
  // avatar rather than anchored bottom-left: name/tier, @username, and
  // the one primary action a visitor actually needs immediately --
  // Follow/Message -- stack directly beneath the avatar as one centered
  // column, both inside the banner's plain middle slot and in the
  // no-banner fallback below. Everything that used to compete for space
  // in this same overlay (watched/top-genre pills, the four-link
  // self-service row) has moved down into the right rail below, next to
  // bio and stats, mirroring the home page's own main-column/rail split
  // so the two most-visited pages in the app share the same reading
  // pattern.
  // Auteur badge: a distinct gold-filled pill (vs. the outlined accent
  // pill used for the Cinephile/Film Buff/Casual Viewer experience tier
  // right next to it) so the two read as different kinds of status --
  // one self-reported taste level everyone has, one paid perk few do.
  // isAuteurActive checks premium_tier specifically, not is_premium, so a
  // Premium (non-Auteur) subscriber or a referral-bonus window correctly
  // shows no badge here. (isAuteur itself is computed up near dnaPromise.)

  const identityBlock = (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="stagger-card min-w-0" style={{ animationDelay: "80ms" }}>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <h1 className="font-display text-xl">{profile.display_name ?? profile.username}</h1>
          <span className="rounded-[var(--radius-full)] border border-accent/50 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
            {tierLabel}
          </span>
          {isAuteur && (
            <span
              className="rounded-[var(--radius-full)] border border-accent bg-accent px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-background"
              title="Slate Auteur subscriber"
            >
              Auteur
            </span>
          )}
        </div>
        <p className="text-sm text-foreground-muted">@{profile.username}</p>
      </div>
      {viewer && !isOwnProfile && (
        <div className="stagger-card flex items-center gap-2" style={{ animationDelay: "160ms" }}>
          <div className="shine-hover rounded-[var(--radius-full)]">
            <FollowButton userId={profile.id} initiallyFollowing={!!isFollowing} />
          </div>
          <div className="shine-hover rounded-[var(--radius-full)]">
            <MessageButton userId={profile.id} />
          </div>
          <BlockUserButton userId={profile.id} initiallyBlocked={!!blockRow} />
          <ReportButton contentType="profile" contentId={profile.id} />
        </div>
      )}
    </div>
  );

  // Right rail: bio, then a 2x2 stat grid (watched / top genre /
  // followers / following -- previously split awkwardly between plain
  // text and pills up in the banner overlay), then the self-service
  // links row (Edit profile / Slate DNA / Watchlist / Your lists),
  // now stacked as a real vertical menu instead of squeezed pills that
  // had to share a row with the follow-stats text.
  // Shared between two placements: the usual spot in the rail below, and
  // (native-app-only, see the ShowOnNative slot right after the Slate DNA
  // panel further down) a second spot directly under Backlot DNA. Built
  // once here so neither placement duplicates this JSX -- HideOnNative /
  // ShowOnNative decide at runtime which one (if either) actually shows,
  // native vs. ordinary website.
  const wrappedPreviewNode = isOwnProfile ? (
    wrapped ? (
      // Wrapped preview: a real poster-backed card (not another icon in
      // the row above) -- the favorite title's poster sits behind the
      // year/stat line the same way a movie poster backs a festival
      // program note, so this reads as a piece of the page's own layout
      // rather than a plain navigation link. The whole card is the tap
      // target. Placed below the icon row (reinstalled here after an
      // earlier pass replaced it with just an icon).
      <Link
        href="/wrapped"
        className="stagger-card group relative mt-6 block h-64 overflow-hidden rounded-[var(--radius-lg)] border border-glass-border"
        style={{ animationDelay: "560ms" }}
      >
        {wrapped.favoriteTitle?.posterUrl && (
          <Image
            src={wrapped.favoriteTitle.posterUrl}
            alt=""
            fill
            sizes="400px"
            className="object-cover opacity-40 transition-transform duration-300 group-hover:scale-105"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/20" />
        <div className="relative flex h-full flex-col justify-end gap-1.5 px-6 py-6">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">Slate Wrapped</p>
          <h3 className="font-display text-3xl">{wrapped.year} Recap</h3>
          <p className="text-sm text-foreground-muted">
            {wrapped.totalRated} title{wrapped.totalRated === 1 ? "" : "s"} rated
            {wrapped.topGenres[0] ? ` \u00b7 Mostly ${wrapped.topGenres[0].genre}` : ""}
          </p>
          <span className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-accent">
            See your full Wrapped &rarr;
          </span>
        </div>
      </Link>
    ) : (
      <div
        className="stagger-card mt-6 rounded-[var(--radius-lg)] border border-dashed border-glass-border bg-glass px-5 py-5 text-center backdrop-blur-sm"
        style={{ animationDelay: "560ms" }}
      >
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-accent">Slate Wrapped</p>
        <p className="mt-1 text-sm text-foreground-muted">
          Rate a few more titles this year and your Wrapped recap fills in here.
        </p>
      </div>
    )
  ) : null;

  const rail = (
    <div>
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
              <span className="font-display text-xs italic leading-tight text-foreground-muted">
                {tierLabel}
              </span>
            </div>
          </div>
          <div className="stagger-card min-w-0" style={{ animationDelay: "300ms" }}>
            <p className="text-xs font-medium uppercase tracking-wider text-foreground-muted">
              Taste fingerprint
            </p>
            <p className="mt-1 font-display text-base italic leading-snug text-accent">{tasteQuote}</p>
          </div>
        </div>
      )}

      {profile.bio && (
        <div className="stagger-card border-b border-border pb-6" style={{ animationDelay: "360ms" }}>
          <span className="text-xs font-medium uppercase tracking-wider text-foreground-muted">About</span>
          <p className="mt-2 text-base leading-relaxed text-foreground-muted">{profile.bio}</p>
        </div>
      )}

      {/* Ticket-stub stat strip: dashed dividers instead of separate
          boxed tiles, reading like the torn perforation on a real
          admission ticket rather than a generic stats card grid. */}
      <div
        className="stagger-card flex divide-x divide-dashed divide-glass-border rounded-[var(--radius-md)] border border-dashed border-glass-border bg-glass pt-5 pb-4 backdrop-blur-sm"
        style={{ animationDelay: "440ms" }}
      >
        <div className="flex-1 px-2 text-center">
          <p className="font-display text-2xl"><AnimatedCounter value={ratingCount ?? 0} /></p>
          <p className="text-[11px] uppercase tracking-wider text-foreground-muted">Watched</p>
        </div>
        <div className="flex-1 px-2 text-center">
          {/* Radial "seal" (CinemaScoreSeal) instead of a bare letter --
              same conic-gradient-ring language as the Taste fingerprint
              wheel above, and the ring itself is a live progress meter
              toward the next grade rather than pure decoration. See
              task #610 / that component's own doc comment. */}
          <CinemaScoreSeal grade={cinemaGrade} points={cinemaPoints} />
          <p className="mt-1.5 text-[11px] uppercase tracking-wider text-foreground-muted">Cinema Score</p>
        </div>
        <div className="flex-1 px-2 text-center">
          <p className="font-display truncate text-2xl">{topGenre ?? "—"}</p>
          <p className="text-[11px] uppercase tracking-wider text-foreground-muted">Top genre</p>
        </div>
        <div className="flex-1 px-2 text-center">
          <p className="font-display text-2xl"><AnimatedCounter value={followerCount ?? 0} /></p>
          <p className="text-[11px] uppercase tracking-wider text-foreground-muted">Followers</p>
        </div>
        <div className="flex-1 px-2 text-center">
          <p className="font-display text-2xl"><AnimatedCounter value={followingCount ?? 0} /></p>
          <p className="text-[11px] uppercase tracking-wider text-foreground-muted">Following</p>
        </div>
      </div>

      {/* Taste evolution: real, already-computed content (dna.evolution --
          same computeTasteDna() call that feeds the DNA panel, no extra
          query) instead of stretching this column's cards to fake-fill
          the gap left by the DNA panel routinely running much taller than
          this rail. Omitted entirely below the evolution.ts sample-size
          floor rather than showing an empty-state placeholder, same rule
          the standalone /taste-dna page uses. */}
      {dna.evolution && dna.evolution.insights.length > 0 && (
        <div
          className="stagger-card mt-6 rounded-[var(--radius-md)] border border-glass-border bg-glass p-5 backdrop-blur-sm"
          style={{ animationDelay: "460ms" }}
        >
          <p className="text-xs font-medium uppercase tracking-wider text-foreground-muted">
            How taste is evolving
          </p>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm leading-relaxed text-foreground-muted">
            {dna.evolution.insights.map((insight) => (
              <li key={insight}>{insight}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Self-service row, condensed to icons (was three stacked
          full-width buttons) -- these are personal utility actions, not
          profile content a visitor came to see, so they don't need to
          compete for vertical space the way the DNA panel and Pyramid
          do. Wrapped keeps its own fuller preview card below instead of
          an icon here -- a plain icon undersold it next to the other
          three, which are truly just links, not a whole feature. */}
      {isOwnProfile && (
        // gap-1 (not gap-5) now that each link carries its own h-11 w-11
        // hit area -- the visible 20px icons keep the same spacing as
        // before, but the tappable region around each is a real 44px
        // target instead of the bare icon (design audit, ranked item #7:
        // this was the most severe touch-target instance in the app).
        <div className="stagger-card mt-6 flex items-center justify-center gap-1" style={{ animationDelay: "500ms" }}>
          <Link
            href="/settings"
            aria-label="Edit profile"
            className="flex h-11 w-11 items-center justify-center text-foreground-muted transition-colors hover:text-accent"
          >
            <Settings size={20} />
          </Link>
          <Link
            href="/watchlist"
            aria-label="Watchlist"
            className="flex h-11 w-11 items-center justify-center text-foreground-muted transition-colors hover:text-accent"
          >
            <Bookmark size={20} />
          </Link>
          <Link
            href="/lists"
            aria-label="Your lists"
            className="flex h-11 w-11 items-center justify-center text-foreground-muted transition-colors hover:text-accent"
          >
            <ListChecks size={20} />
          </Link>
        </div>
      )}

      {/* Hidden on native (see the ShowOnNative placement right after the
          Slate DNA panel below) -- one visible copy of this card
          regardless of platform, just in a different spot on iOS. */}
      <HideOnNative>{wrappedPreviewNode}</HideOnNative>
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
            {bannerImages.map((title, i) =>
              i === bannerAvatarIndex ? (
                /* Middle collage slot: plain background instead of a
                   movie still -- the avatar sits centered on top of it
                   just below. */
                <div
                  key={title.id}
                  className="stagger-card relative flex-1 overflow-hidden bg-background"
                  style={{ animationDelay: `${i * 90}ms` }}
                />
              ) : (
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
                    // Duotone: five favorites are five unrelated titles
                    // with nothing in common tonally -- a blue sci-fi
                    // still next to a red thriller poster next to a
                    // green period piece reads as visual noise, not a
                    // cohesive "cover photo." Desaturating and pushing
                    // everything through the active mode's own accent
                    // hue (gold for Movies, cool slate-blue for Shows --
                    // see BANNER_DUOTONE_FILTER above) makes five random
                    // images read as one deliberate frame instead of
                    // five clashing thumbnails, while keeping the actual
                    // photo content -- faces, composition, what's IN the
                    // shot -- fully visible.
                    style={{ filter: BANNER_DUOTONE_FILTER[mediaType] }}
                    sizes="400px"
                    // This banner collage is the actual LCP element on
                    // every profile page visit (top of page, immediately
                    // below the nav) -- without priority, Next.js
                    // defaults every one of these to loading="lazy",
                    // which delays LCP discovery until well after initial
                    // layout instead of preloading it. Capped at the
                    // first 3 tiles (not the full up-to-6-image row) per
                    // Next's own guidance against marking too many images
                    // priority on one page, which would have them compete
                    // for bandwidth instead of helping.
                    priority={i < 3}
                  />
                </div>
              )
            )}
          </div>
          {/* Bottom-anchored fade -- same via-background/70 strength
              used by the trailer hero's own fade -- so the collage stays
              clearly visible up top instead of the near-invisible wash
              the first pass had, while the overlaid identity content
              still lands on a fully opaque backdrop behind it. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background via-background/70 to-transparent sm:h-48" />
          {/* Radial vignette centered on the avatar column, layered on
              top of the bottom fade above -- this is the fix for
              "avatar getting lost against the collage" that keeps
              coming back regardless of which specific photos a given
              user's favorites happen to be. A duotone tint alone can't
              guarantee contrast (a bright sky or a pale poster can
              still sit right behind the avatar for some users), so this
              adds a targeted dark pool exactly where the avatar sits,
              independent of what's actually in the photo underneath.
              Every tile stays fully visible everywhere else. */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 260px 230px at 50% 52%, var(--background) 0%, transparent 72%)",
            }}
          />
          {/* Avatar plus name/tier/username/Follow-Message now read as
              one centered column set into the banner's own plain middle
              slot -- a portrait-and-caption inlaid in the cover photo,
              rather than the avatar alone up top with identity text
              anchored separately at the bottom-left corner. */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-4">
            <Avatar
              name={profile.display_name ?? profile.username}
              src={profile.avatar_url}
              size={132}
              className="stagger-card shrink-0 border-8 border-black ring-2 ring-accent/70 shadow-[0_4px_18px_rgba(0,0,0,0.55)]"
            />
            {identityBlock}
          </div>
        </div>
      ) : (
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 px-4 pt-8">
          <Avatar
            name={profile.display_name ?? profile.username}
            src={profile.avatar_url}
            size={88}
            className="stagger-card shrink-0"
          />
          {identityBlock}
        </div>
      )}

      <div className="mx-auto max-w-6xl px-4 pb-8 pt-6">
      {/* Three panels, widest in the middle: Slate DNA (what the app
          reads out of your ratings) on the left, Personal Pyramid (what
          you picked yourself) as the visual centerpiece, profile info
          (avatar/bio/stats/self-service links) on the right. DNA and
          profile stay equal width to each other and close in size to
          the pyramid -- wide enough that neither panel feels like a
          narrow sidebar, while the pyramid still reads as the largest
          of the three. Stacks to a single column, same top-to-bottom
          order, below xl. */}
      {/* items-start removed on purpose -- see the comment above the DNA
          panel and the Pyramid panel below for why. Default grid
          align-items (stretch) is what makes the h-full added to both of
          those panels actually do anything. */}
      <div className="grid gap-6 xl:grid-cols-[1fr_1.3fr_1fr]">
      {/* Slate DNA, inline: used to be a link out to a separate page
          (/taste-dna), now sits directly beside the Personal Pyramid as
          this profile's own analytics -- same public visibility as the
          pyramid and stat strip above, scoped to whoever's profile this
          is rather than the viewer. Hidden below MIN_SAMPLE_SIZE for the
          same reason the standalone page hides it: a mostly-empty
          breakdown reads as broken, not "not enough data yet." */}
      {dna.sampleSize >= MIN_SAMPLE_SIZE && (
        // order-2 (after the Pyramid below in the mobile single-column
        // stack) reverts to the natural DOM order (DNA first, i.e. left
        // column) at xl via order-none, so the desktop 3-column layout
        // this grid was designed around (DNA left / Pyramid centerpiece
        // middle / rail right) is untouched -- only the stacked-mobile
        // order changes, putting the Pyramid (what the user picked) above
        // the DNA breakdown (what the app inferred) per product direction.
        <Reveal className="order-2 h-full xl:order-none">
          <div className="bento-card relative flex h-full flex-col overflow-hidden">
            <div className="relative px-6 py-8 sm:px-10 sm:py-10">
              <div className="mb-6 text-center">
                <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-accent">
                  Slate Analysis
                </p>
                <h2 className="font-section-heading mt-1 text-xl">Slate DNA</h2>
                <span className="font-section-body text-xs text-foreground-muted">
                  Based on {dna.sampleSize} rated title{dna.sampleSize === 1 ? "" : "s"}
                </span>
              </div>

              <div className="flex flex-col gap-4">
                {dna.archetypes.slice(0, 6).map((a, i) => (
                  <ArchetypeBar
                    key={a.name}
                    name={a.name}
                    percent={a.percent}
                    delayMs={i * 80}
                    citedTitles={a.citedTitles}
                    matchedKeywords={a.matchedKeywords}
                  />
                ))}
              </div>

              <div className="mt-8 grid gap-6 sm:grid-cols-2">
                {dna.favoriteGenres.length > 0 && (
                  <div>
                    <p className="mb-2 text-[11px] uppercase tracking-wider text-foreground-muted">
                      Favorite genres
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {dna.favoriteGenres.map((g) => (
                        <span
                          key={g}
                          className="rounded-[var(--radius-full)] border border-border bg-surface px-3 py-1 text-xs"
                        >
                          {g}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Language split, not just a single "favorite" -- a user
                    who's 70% English / 30% Korean reads very differently
                    from one who's simply "into Korean cinema." */}
                {dna.languageBreakdown.length > 0 && (
                  <div>
                    <p className="mb-2 text-[11px] uppercase tracking-wider text-foreground-muted">
                      Languages
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {dna.languageBreakdown.map((l) => (
                        <span
                          key={l.label}
                          className="rounded-[var(--radius-full)] border border-border bg-surface px-3 py-1 text-xs"
                        >
                          {l.label} {l.percent}%
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Tone/theme/mood breakdown -- a finer-grained read than the
                  10 fixed archetype buckets above, sourced from the same
                  AI-tagged data but not folded into any single archetype
                  name. Only present once enough titles are enriched. */}
              {dna.moodBreakdown.length > 0 && (
                <div className="mt-8">
                  <p className="mb-2 text-[11px] uppercase tracking-wider text-foreground-muted">
                    Mood &amp; tone
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {dna.moodBreakdown.map((m) => (
                      <span
                        key={m.tag}
                        className="rounded-[var(--radius-full)] border border-border bg-surface px-3 py-1 text-xs capitalize"
                      >
                        {m.tag} {m.percent}%
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {dna.favoriteDirectors.length > 0 && (
                <div className="mt-8">
                  <p className="mb-2 text-[11px] uppercase tracking-wider text-foreground-muted">
                    Favorite directors
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {dna.favoriteDirectors.map((d) => (
                      <span
                        key={d.id}
                        className="rounded-[var(--radius-full)] border border-border bg-surface px-3 py-1 text-xs"
                      >
                        {d.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {signaturePick && (
                <div className="mt-8">
                  <SignaturePickCard pick={signaturePick} compact />
                </div>
              )}

              {(dna.pacingPreference || dna.violenceTolerance != null || dna.comedyTolerance != null) && (
                <div className="mt-8">
                  <p className="mb-2 text-[11px] uppercase tracking-wider text-foreground-muted">
                    Sensibility
                  </p>
                  {/* Was a plain bullet-less <ul>/<li> list -- the only
                      unstyled thing in this panel, sitting directly under
                      pill-badge Favorite directors above it (profile audit,
                      task #841/#844). Same pill treatment as genres/
                      languages/mood/directors just above, so the panel
                      reads as one consistent design language instead of
                      trailing off into plain text at the bottom. */}
                  <div className="flex flex-wrap gap-2">
                    {dna.pacingPreference && (
                      <span className="rounded-[var(--radius-full)] border border-border bg-surface px-3 py-1 text-xs">
                        {PACING_LABEL[dna.pacingPreference] ?? dna.pacingPreference}
                      </span>
                    )}
                    {dna.violenceTolerance != null && (
                      <span className="rounded-[var(--radius-full)] border border-border bg-surface px-3 py-1 text-xs">
                        Violence tolerance {dna.violenceTolerance}/5
                      </span>
                    )}
                    {dna.comedyTolerance != null && (
                      <span className="rounded-[var(--radius-full)] border border-border bg-surface px-3 py-1 text-xs">
                        Comedy tolerance {dna.comedyTolerance}/5
                      </span>
                    )}
                    {dna.emotionalIntensityPreference != null && (
                      <span className="rounded-[var(--radius-full)] border border-border bg-surface px-3 py-1 text-xs">
                        Emotional intensity {dna.emotionalIntensityPreference}/5
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Reveal>
      )}


      {/* Native-app-only: a second copy of the Wrapped preview card,
          positioned directly below Slate DNA (order-3 -- after DNA's
          order-2 and the Pyramid's order-1 in the mobile single-column
          stack the native app always renders, phones never reaching the
          xl breakpoint this grid's 3-column layout needs). The rail's
          own copy is hidden on native via the paired HideOnNative
          wrapper above, so exactly one copy is ever visible. */}
      <ShowOnNative className="order-3">{wrappedPreviewNode}</ShowOnNative>

      {/* h-full (here and on the bordered box just below) so this panel's
          own border/background stretches to match the DNA panel's row
          height instead of ending early and leaving bare page background
          in the gap -- see the grid container comment above. */}
      {/* Own-profile-only empty state: without this, a brand-new
          account (zero favorites, not enough ratings for DNA either)
          landed on this three-panel grid and saw only the right-hand
          rail -- a wide swath of bare page background where the
          Pyramid/DNA centerpiece would normally be, with no indication
          that anything was missing or how to fill it in. Visitors
          looking at someone ELSE'S empty profile still just see
          nothing here (that's the correct read for them -- this
          person hasn't picked favorites, full stop), so this is
          scoped to isOwnProfile only. Links straight to the favorites
          picker (#favorites anchor, see settings/page.tsx) rather than
          just "Settings", since that's the one action that unblocks
          this exact panel. */}
      {favorites.length === 0 && isOwnProfile && (
        <div className="order-1 mt-0 h-full xl:order-none">
          <div className="flex h-full flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-glass-border bg-glass px-8 py-14 text-center backdrop-blur-sm">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-accent">Official selection</p>
            <h2 className="font-section-heading text-xl">Build your Personal Pyramid</h2>
            <p className="max-w-xs font-section-body text-sm text-foreground-muted">
              Pick your top 6 all-time favorites and they&apos;ll take center stage on your profile here.
            </p>
            <Link
              href="/settings#favorites"
              className="bg-gold-foil text-accent-foreground mt-2 inline-flex h-10 items-center rounded-[var(--radius-md)] px-5 text-sm font-medium shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_8px_20px_-8px_rgba(205,166,70,0.55)] hover:brightness-110"
            >
              Choose your favorites
            </Link>
          </div>
        </div>
      )}

      {favorites.length > 0 && (
        // See the order-2/xl:order-none comment on the DNA panel above --
        // this is its counterpart, order-1 so the Pyramid renders first
        // in the mobile stack.
        <div className="order-1 mt-0 h-full xl:order-none">
          {/* The podium used to sit directly on the page background at a
              narrow 480px width, which read as an accidentally small
              widget stranded in a lot of empty page rather than a
              deliberate section. Wrapping it in a bordered panel (with a
              faint gold glow behind it) gives the surrounding space a
              reason to exist — it's the panel's padding, not dead air —
              and widening the panel lets every tile scale up with it. */}
          <div
            className={`relative flex h-full flex-col overflow-hidden rounded-[var(--radius-lg)] border border-glass-border ${theme.showMotif ? "candle-flicker-panel" : ""}`}
          >
            <div
              className="breathe-glow pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse at 50% 30%, rgba(205,166,70,0.08), transparent 70%)",
              }}
            />
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

      {rail}

      </div>

      {compatibility && (
        <Reveal className="mt-6">
          <TasteCompatibilityCard
            compatibility={compatibility}
            otherName={profile.display_name ?? profile.username}
            otherUserId={profile.id}
          />
        </Reveal>
      )}

      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="font-display text-lg italic text-accent">Recently watched</h2>
        {(ratingCount ?? 0) > 12 && (
          <Link href={`/profile/${profile.username}/watched`} className="text-sm text-foreground-muted hover:text-foreground">
            See all {ratingCount} &rarr;
          </Link>
        )}
      </div>
      <Reveal className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
        {recentRatings?.map((r, i) => {
          const title = (r as unknown as { titles: FullTitleRow }).titles;
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
    </div>
  );
}
