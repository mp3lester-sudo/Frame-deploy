import Link from "next/link";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TitleCard } from "@/components/title-card";
import { LoadMoreGrid } from "@/components/load-more-grid";
import { LoadMorePeople } from "@/components/load-more-people";
import { LoadMoreCastCrew } from "@/components/load-more-cast-crew";
import { loadMoreSearchTitles } from "@/lib/actions/catalogue";
import { searchUsers, loadMoreUserSearch } from "@/lib/actions/users";
import { searchCastCrew, loadMoreCastCrew } from "@/lib/actions/cast-crew";
import { SEARCH_PAGE_SIZE, GRID_TITLE_COLUMNS, GRID_TITLE_COLUMNS_WITH_RATING } from "@/lib/constants/catalogue";
import { findCompanyMatch } from "@/lib/search/company-search";
import { getTmdbIdsForCompany, orderByTmdbIdSequence } from "@/lib/search/company-titles";
import { tokenizeSearchQuery } from "@/lib/search/tokenize";
import { cn } from "@/lib/utils";
import type { GridTitle } from "@/components/title-card";
import { getActiveMediaType } from "@/lib/context/media-type";
import { SEARCH_CANDIDATE_POOL_SIZE, personalizeDiscoverPool, type PersonalizableTitle } from "@/lib/discover/personalize";

// orderByTmdbIdSequence (company-match branch below) needs tmdb_id to
// re-sort by TMDB popularity order -- not something TitleCard renders,
// but it has to survive the select() long enough to sort by it.
type Title = GridTitle & { tmdb_id: number | null };

const TABS = [
  { value: "titles", label: "Titles" },
  { value: "people", label: "People" },
  { value: "cast", label: "Actors & Directors" },
] as const;
type Mode = (typeof TABS)[number]["value"];

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  const { q, type } = await searchParams;
  const mode: Mode = type === "people" ? "people" : type === "cast" ? "cast" : "titles";
  const supabase = await createClient();
  const viewer = await getVerifiedUser();
  const mediaType = await getActiveMediaType();

  // Recognizes a studio name (see lib/search/company-search.ts) before
  // falling back to a literal title-name match -- "A24" should surface
  // A24's catalogue, not zero results because no title is literally
  // named "A24".
  const companyMatch = mode === "titles" && q ? findCompanyMatch(q) : null;

  let titles: Title[] = [];
  let titlesHaveMore = false;

  if (mode === "titles" && q) {
    if (companyMatch) {
      const tmdbIds = await getTmdbIdsForCompany(companyMatch.id);
      if (tmdbIds.length > 0) {
        const { data } = await supabase
          .from("titles")
          .select(`${GRID_TITLE_COLUMNS}, tmdb_id`)
          .eq("type", mediaType)
          .in("tmdb_id", tmdbIds);
        titles = orderByTmdbIdSequence(data ?? [], tmdbIds);
      }
      // No "load more" for studio results yet -- this is a recognition
      // feature (query -> studio -> catalogue), not a full paginated
      // browse of everything that studio has made.
      titlesHaveMore = false;
    } else {
      // Match every word in the query somewhere in the title rather than
      // requiring the whole phrase verbatim in that exact order -- see
      // loadMoreSearchTitles (same approach, kept in sync deliberately).
      // Personalization audit finding: this only ever sorted the matched
      // set by weighted_rating -- a search for a common word or an actor
      // with a large filmography returned the same order for every
      // viewer. Same fix as Discover's grid (src/lib/discover/
      // personalize.ts): over-fetch a bounded pool of query-matching
      // titles in weighted_rating order, then re-rank it by blending in
      // this viewer's taste similarity before slicing out the first page.
      let titleBuilder = supabase.from("titles").select(`${GRID_TITLE_COLUMNS_WITH_RATING}, tmdb_id`).eq("type", mediaType);
      for (const word of tokenizeSearchQuery(q)) {
        titleBuilder = titleBuilder.ilike("name", `%${word}%`);
      }
      const { data: pool } = await titleBuilder
        .order("weighted_rating", { ascending: false, nullsFirst: false })
        .range(0, SEARCH_CANDIDATE_POOL_SIZE - 1);
      const rankedPool = await personalizeDiscoverPool(supabase, (pool ?? []) as unknown as (PersonalizableTitle & { tmdb_id: number | null })[], viewer?.id, mediaType);
      titles = rankedPool.slice(0, SEARCH_PAGE_SIZE) as Title[];
      titlesHaveMore = rankedPool.length > SEARCH_PAGE_SIZE;
    }
  }

  const { users, hasMore: usersHaveMore } = mode === "people" && q ? await searchUsers(q) : { users: [], hasMore: false };
  const { people: castCrew, hasMore: castCrewHaveMore } =
    mode === "cast" && q ? await searchCastCrew(q) : { people: [], hasMore: false };

  const loadMoreTitles = loadMoreSearchTitles.bind(null, q ?? "");
  const loadMorePeople = loadMoreUserSearch.bind(null, q ?? "");
  const loadMoreCast = loadMoreCastCrew.bind(null, q ?? "");

  const tabHref = (nextType: Mode) => `/search?type=${nextType}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  const placeholder =
    mode === "people" ? "Search people…" : mode === "cast" ? "Search actors, directors…" : "Search movies, shows, or a studio like A24…";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Plain GET form -- no client JS, no live-search debounce -- so it
          relied entirely on the browser's native "submit on Enter"
          behavior with nothing in the UI signaling that. A search box
          with no visible way to search reads as broken (typing and
          getting silence, with zero loading/empty feedback until the
          user happens to guess to press Enter). The button below is a
          real type="submit" -- no onClick needed, the browser handles
          it identically to pressing Enter since there's still no
          action/onSubmit override here. */}
      <form className="mb-4 flex max-w-md gap-2">
        <input type="hidden" name="type" value={mode} />
        <Input name="q" defaultValue={q} placeholder={placeholder} className="flex-1" />
        <Button type="submit" variant="secondary" size="md" aria-label="Search" className="shrink-0 px-3">
          <Search size={16} />
        </Button>
      </form>

      <div className="mb-6 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={tabHref(t.value)}
            className={cn(
              "px-3 pb-2 text-sm whitespace-nowrap",
              mode === t.value ? "border-b-2 border-accent text-foreground" : "text-foreground-muted hover:text-foreground"
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {mode === "titles" && (
        <>
          {q && !titles.length && <p className="text-sm text-foreground-muted">No results for &ldquo;{q}&rdquo;.</p>}
          {q && companyMatch && titles.length > 0 && (
            <p className="mb-4 text-xs uppercase tracking-wider text-foreground-muted">
              {`Movies from ${companyMatch.name} in Slate's catalogue`}
            </p>
          )}
          {q && companyMatch && titles.length > 0 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
              {titles.map((t, i) => (
                <TitleCard key={t.id} title={t} index={i} />
              ))}
            </div>
          )}
          {q && !companyMatch && (
            <LoadMoreGrid
              // Keyed on the query AND mediaType so a new search -- or a
              // Movies/Shows toggle with the same query -- remounts the
              // grid instead of reusing the previous combo's cached state
              // (see discover/page.tsx for the identical bug: toggling
              // media type with an unchanged query used to collapse to
              // the same storageKey and restore the other media type's
              // stale titles from sessionStorage). storageKey namespaced
              // separately from Discover's so browser back/forward
              // restores this query's loaded pages specifically (see
              // use-persisted-pagination.ts).
              key={`${mediaType}:${q}`}
              storageKey={`search-titles:${mediaType}:${q}`}
              initialTitles={titles}
              initialHasMore={titlesHaveMore}
              loadMore={loadMoreTitles}
            />
          )}
        </>
      )}

      {mode === "people" && (
        <>
          {q && !users.length && <p className="text-sm text-foreground-muted">No one found for &ldquo;{q}&rdquo;.</p>}
          {q && (
            <LoadMorePeople
              key={q}
              storageKey={`search-people:${q}`}
              initialUsers={users}
              initialHasMore={usersHaveMore}
              loadMore={loadMorePeople}
            />
          )}
          {!q && <p className="text-sm text-foreground-muted">Search by username or display name.</p>}
        </>
      )}

      {mode === "cast" && (
        <>
          {q && !castCrew.length && <p className="text-sm text-foreground-muted">No actors or directors found for &ldquo;{q}&rdquo;.</p>}
          {q && (
            <LoadMoreCastCrew
              key={q}
              storageKey={`search-cast:${q}`}
              initialPeople={castCrew}
              initialHasMore={castCrewHaveMore}
              loadMore={loadMoreCast}
            />
          )}
          {!q && <p className="text-sm text-foreground-muted">Search for an actor or director by name.</p>}
        </>
      )}
    </div>
  );
}
