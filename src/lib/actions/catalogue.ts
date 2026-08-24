"use server";

import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { isPremiumActive } from "@/lib/premium/is-premium";
import { DISCOVER_PAGE_SIZE, SEARCH_PAGE_SIZE, GRID_TITLE_COLUMNS, GRID_TITLE_COLUMNS_WITH_RATING } from "@/lib/constants/catalogue";
import type { GridTitle } from "@/components/title-card";
import { ERA_DECADES, type AdvancedDiscoverFilters } from "@/lib/constants/discover-filters";
import { tokenizeSearchQuery } from "@/lib/search/tokenize";
import { getActiveMediaType } from "@/lib/context/media-type";
import { DISCOVER_CANDIDATE_POOL_SIZE, SEARCH_CANDIDATE_POOL_SIZE, personalizeDiscoverPool, type PersonalizableTitle } from "@/lib/discover/personalize";

/**
 * Discover/search only ever rendered their first .limit() page — with the
 * catalogue now in the thousands of titles, that meant everyone saw the same
 * ~24-30 movies no matter what. These give the client-side "Load more" grid
 * (src/components/load-more-grid.tsx) a way to fetch subsequent pages.
 */

export async function loadMoreDiscoverTitles(
  // airing is intentionally outside AdvancedDiscoverFilters -- it's a
  // TV-only, always-free navigational filter (like genre), not one of
  // the four Premium-gated dimensions, so it needs no is_premium check.
  filters: { genre?: string; airing?: "airing" | "ended" } & AdvancedDiscoverFilters,
  page: number
) {
  const { genre, airing, era, pacing, tone, mood } = filters;
  const supabase = await createClient();
  const mediaType = await getActiveMediaType();
  // Needed unconditionally now (not just for the Premium filter check
  // below) so personalizeDiscoverPool knows which viewer's taste vector to
  // blend in -- see src/lib/discover/personalize.ts.
  const viewer = await getVerifiedUser();

  // Advanced filters are a Premium perk (see src/app/discover/page.tsx and
  // CLAUDE.md's product principles). The initial page load already withholds
  // these params server-side for free accounts, but "Load more" is a second,
  // independent entry point — re-checking is_premium here means a bound
  // client value can't be tampered with to smuggle a filter past the wall.
  let isPremium = false;
  if (viewer && (era || pacing || tone || mood)) {
    const { data: profile, error: profileError } = await supabase.from("profiles").select("is_premium, bonus_premium_until").eq("id", viewer.id).maybeSingle();
    if (profileError) console.error("[catalogue] profile lookup", profileError.message);
    isPremium = isPremiumActive(profile);
  }

  // Always select the rating-inclusive column set -- simpler than two
  // parallel select() shapes, and the extra weighted_rating field is
  // harmless (unused) on the plain-order branch below.
  function buildQuery() {
    let q = supabase
      .from("titles")
      .select(GRID_TITLE_COLUMNS_WITH_RATING)
      .eq("type", mediaType)
      .order("weighted_rating", { ascending: false, nullsFirst: false });
    if (genre) q = q.contains("genres", [genre]);
    if (airing === "airing") q = q.eq("in_production", true);
    if (airing === "ended") q = q.eq("in_production", false);
    if (isPremium && pacing) q = q.eq("pacing", pacing);
    if (isPremium && tone) q = q.contains("tone", [tone]);
    if (isPremium && mood) q = q.contains("mood_tags", [mood]);
    if (isPremium && era) {
      const decade = ERA_DECADES.find((d) => d.label === era);
      if (decade) {
        if (decade.start === 0) {
          q = q.lt("release_date", "1960-01-01");
        } else {
          q = q.gte("release_date", `${decade.start}-01-01`).lt("release_date", `${decade.start + 10}-01-01`);
        }
      }
    }
    return q;
  }

  const from = (page - 1) * DISCOVER_PAGE_SIZE;
  const to = from + DISCOVER_PAGE_SIZE - 1;

  // Personalization audit finding (see src/lib/discover/personalize.ts):
  // pages that fall within the same candidate pool the initial page render
  // used (DISCOVER_CANDIDATE_POOL_SIZE, currently 8 pages' worth) need to
  // recompute and re-rank that exact pool fresh -- there's no session-level
  // cache to persist a previously-computed order across requests -- then
  // slice this page's rows out of it, so the ordering a viewer sees on page
  // 1 stays consistent with what they see on page 2, 3, etc. Pages past
  // that boundary fall outside the personalized window: weighted_rating
  // order there is unaffected by how the top of the pool got reordered, so
  // it's cheaper and just as correct to continue the plain query exactly
  // like this action always has.
  if (to < DISCOVER_CANDIDATE_POOL_SIZE) {
    const { data: pool } = await buildQuery().range(0, DISCOVER_CANDIDATE_POOL_SIZE - 1);
    const rankedPool = await personalizeDiscoverPool(supabase, (pool ?? []) as unknown as PersonalizableTitle[], viewer?.id, mediaType);
    const pageTitles = rankedPool.slice(from, to + 1) as GridTitle[];
    return { titles: pageTitles, hasMore: rankedPool.length > to + 1 };
  }

  const { data } = await buildQuery().range(from, to);
  return { titles: (data ?? []) as unknown as GridTitle[], hasMore: (data?.length ?? 0) === DISCOVER_PAGE_SIZE };
}

export async function loadMoreSearchTitles(q: string, page: number) {
  const supabase = await createClient();
  const mediaType = await getActiveMediaType();
  // See src/app/search/page.tsx's initial-page-render branch for the full
  // rationale -- needed here too so the ordering a viewer sees on page 1
  // stays consistent with page 2, 3, etc.
  const viewer = await getVerifiedUser();

  const from = (page - 1) * SEARCH_PAGE_SIZE;
  const to = from + SEARCH_PAGE_SIZE - 1;

  function buildQuery(columns: string) {
    // Match every word in the query somewhere in the title, not the whole
    // phrase verbatim -- "dark knight batman" should still find "The Dark
    // Knight" even though that's not a literal substring of the title.
    // Chained .ilike() calls AND together, same as multiple chained filters.
    let q2 = supabase.from("titles").select(columns).eq("type", mediaType);
    for (const word of tokenizeSearchQuery(q)) {
      q2 = q2.ilike("name", `%${word}%`);
    }
    return q2.order("weighted_rating", { ascending: false, nullsFirst: false });
  }

  // Same bounded-pool-then-reblend approach as loadMoreDiscoverTitles
  // above (see src/lib/discover/personalize.ts) -- pages inside the
  // candidate pool get the pool refetched and reblended fresh, pages past
  // it fall back to the plain query since personalization never reorders
  // anything outside the pool anyway.
  if (to < SEARCH_CANDIDATE_POOL_SIZE) {
    const { data: pool } = await buildQuery(GRID_TITLE_COLUMNS_WITH_RATING).range(0, SEARCH_CANDIDATE_POOL_SIZE - 1);
    const rankedPool = await personalizeDiscoverPool(supabase, (pool ?? []) as unknown as PersonalizableTitle[], viewer?.id, mediaType);
    const pageTitles = rankedPool.slice(from, to + 1) as GridTitle[];
    return { titles: pageTitles, hasMore: rankedPool.length > to + 1 };
  }

  const { data } = await buildQuery(GRID_TITLE_COLUMNS).range(from, to);
  return { titles: (data ?? []) as unknown as GridTitle[], hasMore: (data?.length ?? 0) === SEARCH_PAGE_SIZE };
}
