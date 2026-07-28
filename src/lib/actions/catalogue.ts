"use server";

import { createClient } from "@/lib/supabase/server";
import { DISCOVER_PAGE_SIZE, SEARCH_PAGE_SIZE } from "@/lib/constants/catalogue";

/**
 * Discover/search only ever rendered their first .limit() page — with the
 * catalogue now in the thousands of titles, that meant everyone saw the same
 * ~24-30 movies no matter what. These give the client-side "Load more" grid
 * (src/components/load-more-grid.tsx) a way to fetch subsequent pages.
 */

export async function loadMoreDiscoverTitles(genre: string | undefined, page: number) {
  const supabase = await createClient();
  let query = supabase.from("titles").select("*").order("tmdb_rating", { ascending: false });
  if (genre) query = query.contains("genres", [genre]);

  const from = (page - 1) * DISCOVER_PAGE_SIZE;
  const to = from + DISCOVER_PAGE_SIZE - 1;
  const { data } = await query.range(from, to);

  return { titles: data ?? [], hasMore: (data?.length ?? 0) === DISCOVER_PAGE_SIZE };
}

export async function loadMoreSearchTitles(q: string, page: number) {
  const supabase = await createClient();

  const from = (page - 1) * SEARCH_PAGE_SIZE;
  const to = from + SEARCH_PAGE_SIZE - 1;
  const { data } = await supabase.from("titles").select("*").ilike("name", `%${q}%`).range(from, to);

  return { titles: data ?? [], hasMore: (data?.length ?? 0) === SEARCH_PAGE_SIZE };
}
