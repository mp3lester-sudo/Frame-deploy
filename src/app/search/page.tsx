import { createClient } from "@/lib/supabase/server";
import { Input } from "@/components/ui/input";
import { LoadMoreGrid } from "@/components/load-more-grid";
import { loadMoreSearchTitles } from "@/lib/actions/catalogue";
import { SEARCH_PAGE_SIZE } from "@/lib/constants/catalogue";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();

  const { data: titles } = q
    ? await supabase
        .from("titles")
        .select("*")
        .ilike("name", `%${q}%`)
        .order("weighted_rating", { ascending: false, nullsFirst: false })
        .range(0, SEARCH_PAGE_SIZE - 1)
    : { data: [] };

  const loadMore = loadMoreSearchTitles.bind(null, q ?? "");

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <form className="mb-6">
        <Input name="q" defaultValue={q} placeholder="Search movies and shows…" className="max-w-md" />
      </form>

      {q && !titles?.length && <p className="text-sm text-foreground-muted">No results for &ldquo;{q}&rdquo;.</p>}

      {q && (
        <LoadMoreGrid
          // Keyed on the query so a new search remounts the grid instead of
          // reusing the previous query's cached state (see discover/page.tsx
          // for the same fix and why it's needed).
          key={q}
          initialTitles={titles ?? []}
          initialHasMore={(titles?.length ?? 0) === SEARCH_PAGE_SIZE}
          loadMore={loadMore}
        />
      )}
    </div>
  );
}
