"use client";

import { useState, useTransition } from "react";
import Image from "@/components/ui/fade-image";
import { X, Search } from "lucide-react";
import { searchTitlesForPicker, setFavoriteTitles } from "@/lib/actions/profile";
import { Button } from "@/components/ui/button";

type PickerTitle = { id: string; name: string; release_date: string | null; poster_url: string | null };

function FavoriteSlot({
  fav,
  label,
  onOpen,
  onRemove,
}: {
  fav: PickerTitle | null;
  label?: string;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onOpen}
        className="relative block aspect-[2/3] w-full overflow-hidden rounded-[var(--radius-md)] border border-dashed border-border bg-surface transition-colors hover:border-border-strong"
      >
        {fav?.poster_url ? (
          <Image src={fav.poster_url} alt={fav.name} fill className="object-cover" sizes="140px" />
        ) : (
          <span className="flex h-full items-center justify-center text-2xl text-foreground-muted">+</span>
        )}
      </button>
      {label && (
        <span className="absolute left-1 top-1 rounded-[var(--radius-sm)] bg-background px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
          {label}
        </span>
      )}
      {fav && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${fav.name}`}
          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-background/80 text-foreground-muted hover:text-danger"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

export function FavoriteTitlesEditor({ initialFavorites }: { initialFavorites: PickerTitle[] }) {
  const [favorites, setFavorites] = useState<(PickerTitle | null)[]>(() => {
    const slots: (PickerTitle | null)[] = [null, null, null, null];
    initialFavorites.slice(0, 4).forEach((t, i) => {
      slots[i] = t;
    });
    return slots;
  });
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickerTitle[]>([]);
  const [isSearching, startSearch] = useTransition();
  const [isSaving, startSaving] = useTransition();
  const [saved, setSaved] = useState(false);

  function openSlot(i: number) {
    setActiveSlot(i);
    setQuery("");
    setResults([]);
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    setSaved(false);
    startSearch(async () => {
      const data = await searchTitlesForPicker(value);
      setResults(data);
    });
  }

  function pick(title: PickerTitle) {
    if (activeSlot === null) return;
    setFavorites((prev) => {
      const next = [...prev];
      next[activeSlot] = title;
      return next;
    });
    setActiveSlot(null);
    setSaved(false);
  }

  function removeSlot(i: number) {
    setFavorites((prev) => {
      const next = [...prev];
      next[i] = null;
      return next;
    });
    setSaved(false);
  }

  function handleSave() {
    const ids = favorites.filter((f): f is PickerTitle => f !== null).map((f) => f.id);
    startSaving(async () => {
      await setFavoriteTitles(ids);
      setSaved(true);
    });
  }

  return (
    <div>
      <p className="mb-3 text-[11px] uppercase tracking-wider text-foreground-muted">
        Your four favorites
      </p>
      {/* Slot 0 is your profile's crowned #1 pick — shown bigger here too,
          so the editor previews the same pyramid the profile page renders
          instead of four identical-looking boxes with a hidden ranking. */}
      <div className="flex flex-col items-center gap-3">
        <div className="w-[36%] sm:w-[30%]">
          <FavoriteSlot
            fav={favorites[0]}
            label="#1"
            onOpen={() => openSlot(0)}
            onRemove={() => removeSlot(0)}
          />
        </div>
        <div className="flex w-full max-w-[420px] justify-center gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="w-1/3">
              <FavoriteSlot
                fav={favorites[i]}
                onOpen={() => openSlot(i)}
                onRemove={() => removeSlot(i)}
              />
            </div>
          ))}
        </div>
      </div>

      {activeSlot !== null && (
        <div className="mt-3 rounded-[var(--radius-md)] border border-border bg-surface p-3">
          <div className="flex items-center gap-2">
            <Search size={14} className="shrink-0 text-foreground-muted" />
            <input
              autoFocus
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Search for a title…"
              className="w-full bg-transparent text-sm text-foreground placeholder:text-foreground-muted focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setActiveSlot(null)}
              className="shrink-0 text-xs text-foreground-muted hover:text-foreground"
            >
              Cancel
            </button>
          </div>
          {isSearching && <p className="mt-2 text-xs text-foreground-muted">Searching…</p>}
          {!isSearching && query.trim() && results.length === 0 && (
            <p className="mt-2 text-xs text-foreground-muted">No matches.</p>
          )}
          {!isSearching && results.length > 0 && (
            <div className="mt-2 flex flex-col gap-1">
              {results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => pick(r)}
                  className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-sm hover:bg-surface-raised"
                >
                  <span className="flex-1 truncate">{r.name}</span>
                  {r.release_date && (
                    <span className="shrink-0 text-xs text-foreground-muted">{r.release_date.slice(0, 4)}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <Button type="button" size="sm" variant="secondary" onClick={handleSave} isLoading={isSaving}>
          Save favorites
        </Button>
        {saved && !isSaving && <span className="text-xs text-accent">Saved</span>}
      </div>
    </div>
  );
}
