import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { LoadMoreGrid } from "@/components/load-more-grid";
import { loadMoreDiscoverTitles } from "@/lib/actions/catalogue";
import { DISCOVER_PAGE_SIZE } from "@/lib/constants/catalogue";

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
    .order("weighted_rating", { ascending: false, nullsFirst: false })
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
        {GENRES.map(({ label, value }) => (
          <Link
            key={value}
            href={`/discover?genre=${encodeURIComponent(value)}`}
            className={cn(
              "rounded-[var(--radius-full)] border border-border px-3 py-1 text-sm",
              genre === value && "border-accent text-accent"
            )}
          >
            {label}
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
