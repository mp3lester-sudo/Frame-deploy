import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { isPremiumActive } from "@/lib/premium/is-premium";
import { isAuteurActive } from "@/lib/premium/tier";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { LoadMoreGrid } from "@/components/load-more-grid";
import { loadMoreDiscoverTitles } from "@/lib/actions/catalogue";
import { getMyDiscoverPresets } from "@/lib/actions/discover-presets";
import { SavedFilterPresets } from "@/components/discover/saved-filter-presets";
import { DISCOVER_PAGE_SIZE, GRID_TITLE_COLUMNS_WITH_RATING } from "@/lib/constants/catalogue";
import { ERA_DECADES, PACING_OPTIONS, TONE_OPTIONS, MOOD_OPTIONS } from "@/lib/constants/discover-filters";
import { PremiumUpsell } from "@/components/premium-upsell";
import { SwipeRecsCard } from "@/components/discover/swipe-recs-card";
import { getSwipeDeck } from "@/lib/actions/swipe-recs";
import { getActiveMediaType } from "@/lib/context/media-type";
import { DISCOVER_CANDIDATE_POOL_SIZE, personalizeDiscoverPool, type PersonalizableTitle } from "@/lib/discover/personalize";
import type { GridTitle } from "@/components/title-card";

/**
 * `value` must match the genre string TMDB (and our `titles.genres` column)
 * actually uses — most notably "Science Fiction", not "Sci-Fi". Filtering by
 * the wrong literal silently returned zero rows instead of erroring, so this
 * mismatch went unnoticed. `label` is just the friendlier display text.
 * Covers every genre with a meaningful number of titles in the catalogue so
 * movies are properly compartmentalized rather than just the original
 * arbitrary seven.
 */
const GENRES: { label: string; value: string }[] = [
  { label: "Action", value: "Action" },
  { label: "Adventure", value: "Adventure" },
  { label: "Animation", value: "Animation" },
  { label: "Comedy", value: "Comedy" },
  { label: "Crime", value: "Crime" },
  { label: "Documentary", value: "Documentary" },
  { label: "Drama", value: "Drama" },
  { label: "Family", value: "Family" },
  { label: "Fantasy", value: "Fantasy" },
  { label: "History", value: "History" },
  { label: "Horror", value: "Horror" },
  { label: "Music", value: "Music" },
  { label: "Mystery", value: "Mystery" },
  { label: "Romance", value: "Romance" },
  { label: "Sci-Fi", value: "Science Fiction" },
  { label: "Thriller", value: "Thriller" },
  { label: "War", value: "War" },
  { label: "Western", value: "Western" },
];

function FilterRail({
  label,
  allHref,
  isAll,
  options,
}: {
  label: string;
  allHref: string;
  isAll: boolean;
  options: { label: string; href: string; active: boolean }[];
}) {
  return (
    <div className="mb-4">
      <p className="mb-1.5 text-[10px] uppercase tracking-wider text-foreground-muted">{label}</p>
      <div className="relative -mx-4 px-4">
        <div className="no-scrollbar flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1">
          <Link
            href={allHref}
            className={cn(
              "shrink-0 snap-start whitespace-nowrap rounded-[var(--radius-full)] border px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-wide transition-colors",
              isAll
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border text-foreground-muted hover:border-border-strong hover:text-foreground"
            )}
          >
            All
          </Link>
          {options.map((o) => (
            <Link
              key={o.href}
              href={o.href}
              className={cn(
                "shrink-0 snap-start whitespace-nowrap rounded-[var(--radius-full)] border px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-wide transition-colors",
                o.active
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border text-foreground-muted hover:border-border-strong hover:text-foreground"
              )}
            >
              {o.label}
            </Link>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent" />
      </div>
    </div>
  );
}

/** Full recommendation-engine call (content scoring, diversification, the
 *  whole pipeline) -- deliberately its own async component so it can sit
 *  behind a Suspense boundary instead of blocking the rest of the page.
 *  See the comment in DiscoverPage for why. getSwipeDeck() already
 *  no-ops (returns []) for a logged-out viewer, but the page only renders
 *  this behind `{viewer && ...}` anyway so that path never actually runs
 *  here. */
async function SwipeDeckSection() {
  const swipeDeck = await getSwipeDeck();
  if (swipeDeck.length === 0) return null;
  return (
    <div className="mb-6">
      <SwipeRecsCard initialDeck={swipeDeck} />
    </div>
  );
}

/** Matches SwipeRecsCard's own compact (non-fullscreen) card proportions
 *  closely enough that there's no layout jump when the real deck streams
 *  in and replaces this. */
function SwipeDeckSkeleton() {
  return (
    <div className="mb-6">
      <div className="skeleton h-64 w-full rounded-[var(--radius-lg)] sm:h-72" />
    </div>
  );
}

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{
    genre?: string;
    era?: string;
    pacing?: string;
    tone?: string;
    mood?: string;
    airing?: string;
  }>;
}) {
  const { genre, era, pacing, tone, mood, airing } = await searchParams;
  const activeAiring = airing === "airing" || airing === "ended" ? airing : undefined;
  const supabase = await createClient();
  const viewer = await getVerifiedUser();

  // Profile (for the Premium filter gate) and saved presets don't depend on
  // each other -- fetching them one after another used to add a second
  // round trip to Supabase before this page could even start building the
  // titles query below. The swipe deck used to be a third sequential await
  // right here too (running the *entire* recommendation engine -- easily
  // the single slowest thing on this page), which meant every tap into
  // Discover sat on a blank/skeleton screen for however long content-based
  // scoring + diversification took, even though the deck is a small,
  // visually self-contained card near the top rather than "the page." It's
  // rendered in its own Suspense boundary below now instead (see
  // SwipeDeckSection) -- the filter rail and title grid can paint the
  // moment their own data is ready instead of waiting on the slowest thing
  // on the page.
  let profile: { is_premium: boolean | null; premium_tier: string | null; bonus_premium_until: string | null } | null = null;
  let presets: Awaited<ReturnType<typeof getMyDiscoverPresets>> = [];
  if (viewer) {
    // Advanced filters (era/pacing/tone/mood) are a Premium perk -- checked
    // server-side, not just hidden in the UI, so the URL params below can't
    // be hand-edited to unlock them for a free account. See CLAUDE.md's
    // product principles and /premium.
    const [profileResult, presetsResult] = await Promise.all([
      supabase.from("profiles").select("is_premium, premium_tier, bonus_premium_until").eq("id", viewer.id).maybeSingle(),
      getMyDiscoverPresets(),
    ]);
    profile = profileResult.data;
    presets = presetsResult;
  }
  const isPremium = isPremiumActive(profile);
  const isAuteur = isAuteurActive(profile);

  const effectiveEra = isPremium ? era : undefined;
  const effectivePacing = isPremium ? pacing : undefined;
  const effectiveTone = isPremium ? tone : undefined;
  const effectiveMood = isPremium ? mood : undefined;

  const mediaType = await getActiveMediaType();
  // Fetch a bounded candidate pool in weighted_rating order (the
  // pre-personalization behavior), then re-rank it by blending in taste
  // similarity for this viewer before slicing out the first page -- see
  // src/lib/discover/personalize.ts for why this shape (an over-fetched
  // pool re-ranked in memory) rather than a fresh sorted query, and
  // loadMoreDiscoverTitles below for how subsequent pages stay consistent
  // with this one.
  let query = supabase
    .from("titles")
    .select(GRID_TITLE_COLUMNS_WITH_RATING)
    .eq("type", mediaType)
    .order("weighted_rating", { ascending: false, nullsFirst: false })
    .range(0, DISCOVER_CANDIDATE_POOL_SIZE - 1);
  if (genre) query = query.contains("genres", [genre]);
  // Airing is TV-only and always free (like genre) -- only ever applied
  // when mediaType is "tv", so it's a no-op (and never rendered as a
  // filter pill) in Movies mode.
  if (mediaType === "tv" && activeAiring === "airing") query = query.eq("in_production", true);
  if (mediaType === "tv" && activeAiring === "ended") query = query.eq("in_production", false);
  if (effectivePacing) query = query.eq("pacing", effectivePacing);
  if (effectiveTone) query = query.contains("tone", [effectiveTone]);
  if (effectiveMood) query = query.contains("mood_tags", [effectiveMood]);
  if (effectiveEra) {
    const decade = ERA_DECADES.find((d) => d.label === effectiveEra);
    if (decade) {
      if (decade.start === 0) {
        query = query.lt("release_date", "1960-01-01");
      } else {
        query = query.gte("release_date", `${decade.start}-01-01`).lt("release_date", `${decade.start + 10}-01-01`);
      }
    }
  }
  const { data: pool } = await query;
  const rankedPool = await personalizeDiscoverPool(supabase, (pool ?? []) as PersonalizableTitle[], viewer?.id, mediaType);
  const titles = rankedPool.slice(0, DISCOVER_PAGE_SIZE) as GridTitle[];
  const hasMore = rankedPool.length > DISCOVER_PAGE_SIZE;

  const loadMore = loadMoreDiscoverTitles.bind(null, {
    genre,
    airing: mediaType === "tv" ? activeAiring : undefined,
    era: effectiveEra,
    pacing: effectivePacing,
    tone: effectiveTone,
    mood: effectiveMood,
  });

  // Preserves every other active filter when a Link only changes one facet.
  function hrefWith(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged = { genre, era, pacing, tone, mood, airing: activeAiring, ...overrides };
    for (const [key, value] of Object.entries(merged)) {
      if (value) params.set(key, value);
    }
    const qs = params.toString();
    return qs ? `/discover?${qs}` : "/discover";
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-gold-foil font-section-heading mb-4 text-3xl">Discover</h1>

      {viewer && (
        <Suspense fallback={<SwipeDeckSkeleton />}>
          <SwipeDeckSection />
        </Suspense>
      )}

      {isAuteur && (
        <SavedFilterPresets presets={presets} current={{ genre, era, pacing, tone, mood }} />
      )}

      <div className="mb-2">
        <p className="mb-1.5 text-[10px] uppercase tracking-wider text-foreground-muted">Genre</p>
        <div className="relative -mx-4 px-4">
          <div className="no-scrollbar flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1">
            <Link
              href={hrefWith({ genre: undefined })}
              className={cn(
                "shrink-0 snap-start whitespace-nowrap rounded-[var(--radius-full)] border px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-wide transition-colors",
                !genre
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border text-foreground-muted hover:border-border-strong hover:text-foreground"
              )}
            >
              All
            </Link>
            {GENRES.map(({ label, value }) => (
              <Link
                key={value}
                href={hrefWith({ genre: value })}
                className={cn(
                  "shrink-0 snap-start whitespace-nowrap rounded-[var(--radius-full)] border px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-wide transition-colors",
                  genre === value
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border text-foreground-muted hover:border-border-strong hover:text-foreground"
                )}
              >
                {label}
              </Link>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent" />
        </div>
      </div>

      {mediaType === "tv" && (
        <div className="mb-2 mt-3">
          <FilterRail
            label="Airing"
            allHref={hrefWith({ airing: undefined })}
            isAll={!activeAiring}
            options={[
              { label: "Currently airing", href: hrefWith({ airing: "airing" }), active: activeAiring === "airing" },
              { label: "Ended", href: hrefWith({ airing: "ended" }), active: activeAiring === "ended" },
            ]}
          />
        </div>
      )}

      {isPremium ? (
        <div className="mb-6 mt-4">
          <FilterRail
            label="Era"
            allHref={hrefWith({ era: undefined })}
            isAll={!era}
            options={ERA_DECADES.map((d) => ({ label: d.label, href: hrefWith({ era: d.label }), active: era === d.label }))}
          />
          <FilterRail
            label="Pacing"
            allHref={hrefWith({ pacing: undefined })}
            isAll={!pacing}
            options={PACING_OPTIONS.map((p) => ({
              label: p.label,
              href: hrefWith({ pacing: p.value }),
              active: pacing === p.value,
            }))}
          />
          <FilterRail
            label="Tone"
            allHref={hrefWith({ tone: undefined })}
            isAll={!tone}
            options={TONE_OPTIONS.map((t) => ({ label: t, href: hrefWith({ tone: t }), active: tone === t }))}
          />
          <FilterRail
            label="Mood"
            allHref={hrefWith({ mood: undefined })}
            isAll={!mood}
            options={MOOD_OPTIONS.map((m) => ({ label: m, href: hrefWith({ mood: m }), active: mood === m }))}
          />
        </div>
      ) : (
        <div className="mb-6 mt-3">
          <PremiumUpsell message="Filter by era, pacing, tone, and mood." />
        </div>
      )}

      <LoadMoreGrid
        // Keyed on every active filter (mediaType included) so switching
        // any of them remounts the grid — otherwise its internal state
        // keeps showing the previous combo's titles until a full page
        // reload. mediaType specifically: without it, toggling Movies/
        // Shows with no other filters active collapsed to the exact same
        // key both sides ("discover:|||||"), so the sessionStorage-
        // persisted pagination state (see use-persisted-pagination.ts)
        // restored the OTHER media type's cached titles right over the
        // fresh server-rendered ones -- the swipe deck above never had
        // this problem since it's re-fetched fresh every render with no
        // client-side cache, only this grid did. The same string doubles
        // as the sessionStorage key the grid persists its loaded pages
        // under, so browser back/forward restores exactly this filter
        // combo's progress, not some other combo's leftover state.
        key={`discover:${mediaType}|${genre ?? ""}|${activeAiring ?? ""}|${effectiveEra ?? ""}|${effectivePacing ?? ""}|${effectiveTone ?? ""}|${effectiveMood ?? ""}`}
        storageKey={`discover:${mediaType}|${genre ?? ""}|${activeAiring ?? ""}|${effectiveEra ?? ""}|${effectivePacing ?? ""}|${effectiveTone ?? ""}|${effectiveMood ?? ""}`}
        initialTitles={titles}
        initialHasMore={hasMore}
        loadMore={loadMore}
      />
    </div>
  );
}
