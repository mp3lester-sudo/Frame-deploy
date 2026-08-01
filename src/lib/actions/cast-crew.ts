"use server";

import { createClient } from "@/lib/supabase/server";
import { PEOPLE_SEARCH_PAGE_SIZE } from "@/lib/constants/social";

/**
 * Search over real film cast/crew (the `people` table -- actors,
 * directors, etc. ingested alongside the catalogue, distinct from
 * `profiles`/app-user accounts covered by lib/actions/users.ts). Mirrors
 * that file's pagination shape exactly so search/page.tsx's third tab
 * can reuse the same LoadMore pattern, just pointed at a different table
 * and result type.
 */
export interface CastCrewSearchResult {
  id: string;
  name: string;
  role: string | null;
  photoUrl: string | null;
}

async function searchCastCrewPage(rawQuery: string, from: number, to: number) {
  const query = rawQuery.trim();
  if (!query) return { people: [] as CastCrewSearchResult[], hasMore: false };

  const supabase = await createClient();
  // No .or() filter needed here (unlike buildUserSearchFilter) -- there's
  // only one searchable column, and .ilike() passes the pattern as a
  // parameter rather than splicing it into a raw filter string, so the
  // comma/paren-escaping that filter needs doesn't apply here.
  const { data } = await supabase
    .from("people")
    .select("id, name, role, photo_url")
    .ilike("name", `%${query}%`)
    .order("name")
    .range(from, to);

  const people: CastCrewSearchResult[] = (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    photoUrl: p.photo_url,
  }));

  return { people, hasMore: people.length === to - from + 1 };
}

export async function searchCastCrew(query: string) {
  return searchCastCrewPage(query, 0, PEOPLE_SEARCH_PAGE_SIZE - 1);
}

export async function loadMoreCastCrew(query: string, page: number) {
  const from = (page - 1) * PEOPLE_SEARCH_PAGE_SIZE;
  const to = from + PEOPLE_SEARCH_PAGE_SIZE - 1;
  return searchCastCrewPage(query, from, to);
}
