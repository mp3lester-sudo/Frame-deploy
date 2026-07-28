"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setMyMovieNightPreferences } from "@/lib/actions/movie-night";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const GENRE_OPTIONS = [
  "Action",
  "Comedy",
  "Drama",
  "Horror",
  "Thriller",
  "Romance",
  "Sci-Fi",
  "Documentary",
  "Animation",
  "Crime",
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
        {GENRE_OPTIONS.map((genre) => {
          const active = excluded.includes(genre);
          return (
            <button
              type="button"
              key={genre}
              onClick={() => toggleGenre(genre)}
              className={cn(
                "rounded-[var(--radius-full)] border px-3 py-1 text-[11px] uppercase tracking-wide transition-colors",
                active
                  ? "border-danger/50 bg-danger/10 text-danger"
                  : "border-border text-foreground-muted hover:border-border-strong"
              )}
            >
              {active ? `No ${genre}` : genre}
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
