"use server";

import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { isPremiumActive } from "@/lib/premium/is-premium";
import { DISCOVER_PAGE_SIZE, SEARCH_PAGE_SIZE } from "@/lib/constants/catalogue";
import { ERA_DECADES, type AdvancedDiscoverFilters } from "@/lib/constants/discover-filters";
import { tokenizeSearchQuery } from "@/lib/search/tokenize";

/**
 * Discover/search only ever rendered their first .limit() page — with the
 * catalogue now in the thousands of titles, that meant everyone saw the same
 * ~24-30 movies no matter what. These give the client-side "Load more" grid
 * (src/components/load-more-grid.tsx) a way to fetch subsequent pages.
 */

export async function loadMoreDiscoverTitles(
  filters: { genre?: string } & AdvancedDiscoverFilters,
  page: number
) {
  const { genre, era, pacing, tone, mood } = filters;
  const supabase = await createClient();

  // Advanced filters are a Premium perk (see src/app/discover/page.tsx and
  // CLAUDE.md's product principles). The initial page load already withholds
  // these params server-side for free accounts, but "Load more" is a second,
  // independent entry point — re-checking is_premium here means a bound
  // client value can't be tampered with to smuggle a filter past the wall.
  let isPremium = false;
  if (era || pacing || tone || mood) {
    const viewer = await getVerifiedUser();
    if (viewer) {
      const { data: profile } = await supabase.from("profiles").select("is_premium, bonus_premium_until").eq("id", viewer.id).maybeSingle();
      isPremium = isPremiumActive(profile);
    }
  }

  let query = supabase
    .from("titles")
    .select("*")
    .order("weighted_rating", { ascending: false, nullsFirst: false });
  if (genre) query = query.contains("genres", [genre]);
  if (isPremium && pacing) query = query.eq("pacing", pacing);
  if (isPremium && tone) query = query.contains("tone", [tone]);
  if (isPremium && mood) query = query.contains("mood_tags", [mood]);
  if (isPremium && era) {
    const decade = ERA_DECADES.find((d) => d.label === era);
    if (decade) {
      if (decade.start === 0) {
        query = query.lt("release_date", "1960-01-01");
      } else {
        query = query.gte("release_date", `${decade.start}-01-01`).lt("release_date", `${decade.start + 10}-01-01`);
      }
    }
  }

  const from = (page - 1) * DISCOVER_PAGE_SIZE;
  const to = from + DISCOVER_PAGE_SIZE - 1;
  const { data } = await query.range(from, to);

  return { titles: data ?? [], hasMore: (data?.length ?? 0) === DISCOVER_PAGE_SIZE };
}

export async function loadMoreSearchTitles(q: string, page: number) {
  const supabase = await createClient();

  const from = (page - 1) * SEARCH_PAGE_SIZE;
  const to = from + SEARCH_PAGE_SIZE - 1;
  // Match every word in the query somewhere in the title, not the whole
  // phrase verbatim -- "dark knight batman" should still find "The Dark
  // Knight" even though that's not a literal substring of the title.
  // Chained .ilike() calls AND together, same as multiple chained filters.
  let builder = supabase.from("titles").select("*");
  for (const word of tokenizeSearchQuery(q)) {
    builder = builder.ilike("name", `%${word}%`);
  }
  const { data } = await builder.order("weighted_rating", { ascending: false, nullsFirst: false }).range(from, to);

  return { titles: data ?? [], hasMore: (data?.length ?? 0) === SEARCH_PAGE_SIZE };
}
