import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { LoadMoreGrid } from "@/components/load-more-grid";
import { loadMoreDiscoverTitles } from "@/lib/actions/catalogue";
import { DISCOVER_PAGE_SIZE } from "@/lib/constants/catalogue";

const GENRES = ["Drama", "Comedy", "Thriller", "Horror", "Animation", "Documentary", "Sci-Fi"];

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ genre?: string }>;
}) {
  const { genre } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("titles")
    .select("*")
    .order("popularity", { ascending: false, nullsFirst: false })
    .range(0, DISCOVER_PAGE_SIZE - 1);
  if (genre) query = query.contains("genres", [genre]);
  const { data: titles } = await query;

  const loadMore = loadMoreDiscoverTitles.bind(null, genre);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-semibold">Discover</h1>

      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href="/discover"
          className={cn(
            "rounded-[var(--radius-full)] border border-border px-3 py-1 text-sm",
            !genre && "border-accent text-accent"
          )}
        >
          All
        </Link>
        {GENRES.map((g) => (
          <Link
            key={g}
            href={`/discover?genre=${encodeURIComponent(g)}`}
            className={cn(
              "rounded-[var(--radius-full)] border border-border px-3 py-1 text-sm",
              genre === g && "border-accent text-accent"
            )}
          >
            {g}
          </Link>
        ))}
      </div>

      <LoadMoreGrid
        initialTitles={titles ?? []}
        initialHasMore={(titles?.length ?? 0) === DISCOVER_PAGE_SIZE}
        loadMore={loadMore}
      />
    </div>
  );
}
