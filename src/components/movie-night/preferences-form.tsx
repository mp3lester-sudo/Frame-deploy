"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setMyMovieNightPreferences } from "@/lib/actions/movie-night";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// `value` must match the literal genre string stored in titles.genres
// (TMDB's own naming — "Science Fiction", not "Sci-Fi"). Excluding "Sci-Fi"
// previously matched nothing since no title's genres array contains that
// literal string, so the exclusion silently did nothing.
const GENRE_OPTIONS: { label: string; value: string }[] = [
  { label: "Action", value: "Action" },
  { label: "Comedy", value: "Comedy" },
  { label: "Drama", value: "Drama" },
  { label: "Horror", value: "Horror" },
  { label: "Thriller", value: "Thriller" },
  { label: "Romance", value: "Romance" },
  { label: "Sci-Fi", value: "Science Fiction" },
  { label: "Documentary", value: "Documentary" },
  { label: "Animation", value: "Animation" },
  { label: "Crime", value: "Crime" },
];

export function PreferencesForm({
  movieNightId,
  initialMood,
  initialExcludedGenres,
}: {
  movieNightId: string;
  initialMood: string | null;
  initialExcludedGenres: string[];
}) {
  const [mood, setMood] = useState(initialMood ?? "");
  const [excluded, setExcluded] = useState<string[]>(initialExcludedGenres);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function toggleGenre(genre: string) {
    setSaved(false);
    setExcluded((prev) => (prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      await setMyMovieNightPreferences({ movieNightId, mood, excludedGenres: excluded });
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-[var(--radius-md)] border border-border bg-surface p-4">
      <p className="mb-3 text-[11px] uppercase tracking-wider text-foreground-muted">Your preferences</p>

      <Input
        value={mood}
        onChange={(e) => {
          setMood(e.target.value);
          setSaved(false);
        }}
        placeholder="Mood (e.g. something calmer)"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        {GENRE_OPTIONS.map(({ label, value }) => {
          const active = excluded.includes(value);
          return (
            <button
              type="button"
              key={value}
              onClick={() => toggleGenre(value)}
              className={cn(
                "rounded-[var(--radius-full)] border px-3 py-1 text-[11px] uppercase tracking-wide transition-colors",
                active
                  ? "border-danger/50 bg-danger/10 text-danger"
                  : "border-border text-foreground-muted hover:border-border-strong"
              )}
            >
              {active ? `No ${label}` : label}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Button type="submit" size="sm" variant="secondary" isLoading={isPending}>
          Save preferences
        </Button>
        {saved && !isPending && <span className="text-xs text-accent">Saved</span>}
      </div>
    </form>
  );
}
