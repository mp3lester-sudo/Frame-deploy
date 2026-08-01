import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Input } from "@/components/ui/input";
import { TitleCard } from "@/components/title-card";
import { LoadMoreGrid } from "@/components/load-more-grid";
import { LoadMorePeople } from "@/components/load-more-people";
import { LoadMoreCastCrew } from "@/components/load-more-cast-crew";
import { loadMoreSearchTitles } from "@/lib/actions/catalogue";
import { searchUsers, loadMoreUserSearch } from "@/lib/actions/users";
import { searchCastCrew, loadMoreCastCrew } from "@/lib/actions/cast-crew";
import { SEARCH_PAGE_SIZE } from "@/lib/constants/catalogue";
import { findCompanyMatch } from "@/lib/search/company-search";
import { getTmdbIdsForCompany, orderByTmdbIdSequence } from "@/lib/search/company-titles";
import { cn } from "@/lib/utils";
import type { Database } from "@/lib/supabase/types";

type Title = Database["public"]["Tables"]["titles"]["Row"];

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
        const { data } = await supabase.from("titles").select("*").in("tmdb_id", tmdbIds);
        titles = orderByTmdbIdSequence(data ?? [], tmdbIds);
      }
      // No "load more" for studio results yet -- this is a recognition
      // feature (query -> studio -> catalogue), not a full paginated
      // browse of everything that studio has made.
      titlesHaveMore = false;
    } else {
      const { data } = await supabase
        .from("titles")
        .select("*")
        .ilike("name", `%${q}%`)
        .order("weighted_rating", { ascending: false, nullsFirst: false })
        .range(0, SEARCH_PAGE_SIZE - 1);
      titles = data ?? [];
      titlesHaveMore = titles.length === SEARCH_PAGE_SIZE;
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
      <form className="mb-4">
        <input type="hidden" name="type" value={mode} />
        <Input name="q" defaultValue={q} placeholder={placeholder} className="max-w-md" />
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
              {`Movies from ${companyMatch.name} in Backlot's catalogue`}
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
              // Keyed on the query so a new search remounts the grid instead
              // of reusing the previous query's cached state (see
              // discover/page.tsx for the same fix and why it's needed).
              // storageKey namespaced separately from Discover's so browser
              // back/forward restores this query's loaded pages specifically
              // (see use-persisted-pagination.ts).
              key={q}
              storageKey={`search-titles:${q}`}
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
