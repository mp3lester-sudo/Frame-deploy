import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { LoadMoreGrid } from "@/components/load-more-grid";
import { loadMoreDiscoverTitles } from "@/lib/actions/catalogue";
import { DISCOVER_PAGE_SIZE } from "@/lib/constants/catalogue";
import { ERA_DECADES, PACING_OPTIONS, TONE_OPTIONS, MOOD_OPTIONS } from "@/lib/constants/discover-filters";
import { PremiumUpsell } from "@/components/premium-upsell";

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

function FilterRail({
  label,
  allHref,
  isAll,
  options,
}: {
  label: string;
  allHref: string;
  isAll: boolean;
  options: { label: string; href: string; active: boolean }[];
}) {
  return (
    <div className="mb-4">
      <p className="mb-1.5 text-[10px] uppercase tracking-wider text-foreground-muted">{label}</p>
      <div className="relative -mx-4 px-4">
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          <Link
            href={allHref}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-[var(--radius-full)] border px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-wide transition-colors",
              isAll
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border text-foreground-muted hover:border-border-strong hover:text-foreground"
            )}
          >
            All
          </Link>
          {options.map((o) => (
            <Link
              key={o.href}
              href={o.href}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-[var(--radius-full)] border px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-wide transition-colors",
                o.active
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border text-foreground-muted hover:border-border-strong hover:text-foreground"
              )}
            >
              {o.label}
            </Link>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent" />
      </div>
    </div>
  );
}

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ genre?: string; era?: string; pacing?: string; tone?: string; mood?: string }>;
}) {
  const { genre, era, pacing, tone, mood } = await searchParams;
  const supabase = await createClient();
  const viewer = await getVerifiedUser();

  // Advanced filters (era/pacing/tone/mood) are a Premium perk — checked
  // server-side, not just hidden in the UI, so the URL params below can't be
  // hand-edited to unlock them for a free account. See CLAUDE.md's product
  // principles and /premium.
  const { data: profile } = viewer
    ? await supabase.from("profiles").select("is_premium").eq("id", viewer.id).maybeSingle()
    : { data: null };
  const isPremium = profile?.is_premium ?? false;

  const effectiveEra = isPremium ? era : undefined;
  const effectivePacing = isPremium ? pacing : undefined;
  const effectiveTone = isPremium ? tone : undefined;
  const effectiveMood = isPremium ? mood : undefined;

  let query = supabase
    .from("titles")
    .select("*")
    .order("weighted_rating", { ascending: false, nullsFirst: false })
    .range(0, DISCOVER_PAGE_SIZE - 1);
  if (genre) query = query.contains("genres", [genre]);
  if (effectivePacing) query = query.eq("pacing", effectivePacing);
  if (effectiveTone) query = query.contains("tone", [effectiveTone]);
  if (effectiveMood) query = query.contains("mood_tags", [effectiveMood]);
  if (effectiveEra) {
    const decade = ERA_DECADES.find((d) => d.label === effectiveEra);
    if (decade) {
      if (decade.start === 0) {
        query = query.lt("release_date", "1960-01-01");
      } else {
        query = query.gte("release_date", `${decade.start}-01-01`).lt("release_date", `${decade.start + 10}-01-01`);
      }
    }
  }
  const { data: titles } = await query;

  const loadMore = loadMoreDiscoverTitles.bind(null, {
    genre,
    era: effectiveEra,
    pacing: effectivePacing,
    tone: effectiveTone,
    mood: effectiveMood,
  });

  // Preserves every other active filter when a Link only changes one facet.
  function hrefWith(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged = { genre, era, pacing, tone, mood, ...overrides };
    for (const [key, value] of Object.entries(merged)) {
      if (value) params.set(key, value);
    }
    const qs = params.toString();
    return qs ? `/discover?${qs}` : "/discover";
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-semibold">Discover</h1>

      <div className="mb-2">
        <p className="mb-1.5 text-[10px] uppercase tracking-wider text-foreground-muted">Genre</p>
        <div className="relative -mx-4 px-4">
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
            <Link
              href={hrefWith({ genre: undefined })}
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
                href={hrefWith({ genre: value })}
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
          <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent" />
        </div>
      </div>

      {isPremium ? (
        <div className="mb-6 mt-4">
          <FilterRail
            label="Era"
            allHref={hrefWith({ era: undefined })}
            isAll={!era}
            options={ERA_DECADES.map((d) => ({ label: d.label, href: hrefWith({ era: d.label }), active: era === d.label }))}
          />
          <FilterRail
            label="Pacing"
            allHref={hrefWith({ pacing: undefined })}
            isAll={!pacing}
            options={PACING_OPTIONS.map((p) => ({
              label: p.label,
              href: hrefWith({ pacing: p.value }),
              active: pacing === p.value,
            }))}
          />
          <FilterRail
            label="Tone"
            allHref={hrefWith({ tone: undefined })}
            isAll={!tone}
            options={TONE_OPTIONS.map((t) => ({ label: t, href: hrefWith({ tone: t }), active: tone === t }))}
          />
          <FilterRail
            label="Mood"
            allHref={hrefWith({ mood: undefined })}
            isAll={!mood}
            options={MOOD_OPTIONS.map((m) => ({ label: m, href: hrefWith({ mood: m }), active: mood === m }))}
          />
        </div>
      ) : (
        <div className="mb-6 mt-3">
          <PremiumUpsell message="Filter by era, pacing, tone, and mood." />
        </div>
      )}

      <LoadMoreGrid
        // Keyed on every active filter so switching any of them remounts the
        // grid — otherwise its internal state keeps showing the previous
        // filter's titles until a full page reload. The same string doubles
        // as the sessionStorage key the grid persists its loaded pages
        // under (see use-persisted-pagination.ts), so browser back/forward
        // restores exactly this filter combo's progress, not some other
        // combo's leftover state.
        key={`discover:${genre ?? ""}|${effectiveEra ?? ""}|${effectivePacing ?? ""}|${effectiveTone ?? ""}|${effectiveMood ?? ""}`}
        storageKey={`discover:${genre ?? ""}|${effectiveEra ?? ""}|${effectivePacing ?? ""}|${effectiveTone ?? ""}|${effectiveMood ?? ""}`}
        initialTitles={titles ?? []}
        initialHasMore={(titles?.length ?? 0) === DISCOVER_PAGE_SIZE}
        loadMore={loadMore}
      />
    </div>
  );
}
