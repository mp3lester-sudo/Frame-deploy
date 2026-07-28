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

      <div className="relative mb-8 -mx-4 px-4">
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          <Link
            href="/discover"
            className={cn(
              "shrink-0 whitespace-nowrap rounded-[var(--radius-full)] border px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-wide transition-colors",
              !genre
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border text-foreground-muted hover:border-border-strong hover:text-foreground"
            )}
          >
            All
          </Link>
          {GENRES.map(({ label, value }) => (
            <Link
              key={value}
              href={`/discover?genre=${encodeURIComponent(value)}`}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-[var(--radius-full)] border px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-wide transition-colors",
                genre === value
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border text-foreground-muted hover:border-border-strong hover:text-foreground"
              )}
            >
              {label}
            </Link>
          ))}
        </div>
        {/* Edge fades hint that the rail scrolls, without a visible scrollbar */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent" />
      </div>

      <LoadMoreGrid
        // Keyed on genre so switching filters remounts the grid — otherwise
        // its internal `useState(initialTitles)` keeps showing the previous
        // genre's titles (only seeded on mount) until a full page reload.
        key={genre ?? "all"}
        initialTitles={titles ?? []}
        initialHasMore={(titles?.length ?? 0) === DISCOVER_PAGE_SIZE}
        loadMore={loadMore}
      />
    </div>
  );
}
