import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Input } from "@/components/ui/input";
import { LoadMoreGrid } from "@/components/load-more-grid";
import { LoadMorePeople } from "@/components/load-more-people";
import { loadMoreSearchTitles } from "@/lib/actions/catalogue";
import { searchUsers, loadMoreUserSearch } from "@/lib/actions/users";
import { SEARCH_PAGE_SIZE } from "@/lib/constants/catalogue";
import { cn } from "@/lib/utils";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  const { q, type } = await searchParams;
  const mode = type === "people" ? "people" : "titles";
  const supabase = await createClient();

  const { data: titles } =
    mode === "titles" && q
      ? await supabase
          .from("titles")
          .select("*")
          .ilike("name", `%${q}%`)
          .order("weighted_rating", { ascending: false, nullsFirst: false })
          .range(0, SEARCH_PAGE_SIZE - 1)
      : { data: [] };

  const { users, hasMore: usersHaveMore } = mode === "people" && q ? await searchUsers(q) : { users: [], hasMore: false };

  const loadMoreTitles = loadMoreSearchTitles.bind(null, q ?? "");
  const loadMorePeople = loadMoreUserSearch.bind(null, q ?? "");

  const tabHref = (nextType: "titles" | "people") => `/search?type=${nextType}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <form className="mb-4">
        <input type="hidden" name="type" value={mode} />
        <Input
          name="q"
          defaultValue={q}
          placeholder={mode === "people" ? "Search people…" : "Search movies and shows…"}
          className="max-w-md"
        />
      </form>

      <div className="mb-6 flex gap-1 border-b border-border">
        {(["titles", "people"] as const).map((t) => (
          <Link
            key={t}
            href={tabHref(t)}
            className={cn(
              "px-3 pb-2 text-sm capitalize",
              mode === t ? "border-b-2 border-accent text-foreground" : "text-foreground-muted hover:text-foreground"
            )}
          >
            {t}
          </Link>
        ))}
      </div>

      {mode === "titles" && (
        <>
          {q && !titles?.length && <p className="text-sm text-foreground-muted">No results for &ldquo;{q}&rdquo;.</p>}
          {q && (
            <LoadMoreGrid
              // Keyed on the query so a new search remounts the grid instead
              // of reusing the previous query's cached state (see
              // discover/page.tsx for the same fix and why it's needed).
              // storageKey namespaced separately from Discover's so browser
              // back/forward restores this query's loaded pages specifically
              // (see use-persisted-pagination.ts).
              key={q}
              storageKey={`search-titles:${q}`}
              initialTitles={titles ?? []}
              initialHasMore={(titles?.length ?? 0) === SEARCH_PAGE_SIZE}
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
    </div>
  );
}
