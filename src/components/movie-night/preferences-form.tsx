"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { setMyMovieNightPreferences } from "@/lib/actions/movie-night";
import { Input } from "@/components/ui/input";
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

// Mood is free text, so it auto-saves on a short pause after typing rather
// than on every keystroke -- long enough that a normal typing cadence
// never fires mid-word, short enough that it still reads as immediate.
const MOOD_AUTOSAVE_DELAY_MS = 600;

/**
 * Auto-saves as you go -- no "Save preferences" button to remember to
 * click. Genre toggles save the instant you click them (they're already
 * discrete, deliberate actions); the mood field debounces briefly after
 * you stop typing, always reading the LATEST excluded-genres list at the
 * moment it actually fires (via a ref, not a stale closure) so a quick
 * genre toggle right after typing can't get silently overwritten by a
 * mood autosave that was scheduled a moment earlier.
 *
 * Each save writes straight to movie_night_participants, which is
 * exactly the table LiveCandidateVoting and LiveParticipants already
 * watch over Supabase Realtime -- so the moment this save lands, every
 * open screen (including your own candidate grid) picks up the change in
 * place, with no full-page reload anywhere in the loop.
 */
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
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const moodTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);
  const excludedRef = useRef(excluded);
  excludedRef.current = excluded;
  const moodRef = useRef(mood);
  moodRef.current = mood;

  function save(nextMood: string, nextExcluded: string[]) {
    setStatus("saving");
    startTransition(async () => {
      try {
        const result = await setMyMovieNightPreferences({ movieNightId, mood: nextMood, excludedGenres: nextExcluded });
        if (result.ok) {
          setStatus("saved");
          setErrorMessage(null);
        } else {
          setStatus("error");
          setErrorMessage(result.error);
        }
      } catch (err) {
        setStatus("error");
        setErrorMessage(err instanceof Error ? err.message : "Could not save preferences");
      }
    });
  }

  // Skip the very first render -- initialMood/initialExcludedGenres are
  // already what's saved, so there's nothing to write back yet.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (moodTimer.current) clearTimeout(moodTimer.current);
    moodTimer.current = setTimeout(() => {
      save(moodRef.current, excludedRef.current);
    }, MOOD_AUTOSAVE_DELAY_MS);
    return () => {
      if (moodTimer.current) clearTimeout(moodTimer.current);
    };
  }, [mood]);

  function toggleGenre(genre: string) {
    const next = excluded.includes(genre) ? excluded.filter((g) => g !== genre) : [...excluded, genre];
    setExcluded(next);
    excludedRef.current = next;
    // An explicit click, not free text -- save right away rather than
    // waiting out the mood field's debounce (and cancel any pending mood
    // save so it can't fire afterward with a stale excluded-genres list).
    if (moodTimer.current) clearTimeout(moodTimer.current);
    save(moodRef.current, next);
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wider text-foreground-muted">Your preferences</p>
        <span className="text-[11px] text-foreground-muted">
          {status === "saving" && "Saving…"}
          {status === "saved" && "Saved"}
          {status === "error" && <span className="text-danger">Couldn&apos;t save</span>}
        </span>
      </div>

      <Input
        value={mood}
        onChange={(e) => {
          setStatus("idle");
          setMood(e.target.value);
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
      {status === "error" && errorMessage && (
        <p className="mt-2 text-[11px] text-danger">{errorMessage}</p>
      )}
    </div>
  );
}
