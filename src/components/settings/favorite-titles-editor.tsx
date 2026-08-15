"use client";

import { useState, useTransition } from "react";
import Image from "@/components/ui/fade-image";
import { X, Search } from "lucide-react";
import { searchTitlesForPicker, setFavoriteTitles } from "@/lib/actions/profile";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MediaType } from "@/lib/context/media-type-cookie";

type PickerTitle = { id: string; name: string; release_date: string | null; poster_url: string | null };

function FavoriteSlot({
  fav,
  label,
  highlight,
  onOpen,
  onRemove,
}: {
  fav: PickerTitle | null;
  label?: string;
  /** Matches TitleCard's highlight treatment so the #1 slot previews the
      same gold rim it'll get on the actual profile. */
  highlight?: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onOpen}
        aria-label={fav ? `Change favorite: ${fav.name}` : "Add a favorite title"}
        className={cn(
          "relative block aspect-[2/3] w-full overflow-hidden rounded-[var(--radius-md)] bg-surface transition-colors",
          highlight
            ? "border-2 border-accent shadow-[0_0_20px_-4px_rgba(205,166,70,0.65)]"
            : "border border-dashed border-border hover:border-border-strong"
        )}
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

export function FavoriteTitlesEditor({
  initialFavorites,
  mediaType,
}: {
  initialFavorites: PickerTitle[];
  /** "Fully separate profiles" -- movie favorites and show favorites are
   *  two independent top-6 lists. This component always edits whichever
   *  one matches the currently active toggle (passed down from the
   *  server-rendered Settings page, which re-fetches initialFavorites
   *  scoped to it too). */
  mediaType: MediaType;
}) {
  const [favorites, setFavorites] = useState<(PickerTitle | null)[]>(() => {
    const slots: (PickerTitle | null)[] = [null, null, null, null, null, null];
    initialFavorites.slice(0, 6).forEach((t, i) => {
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
      const data = await searchTitlesForPicker(value, mediaType);
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
      await setFavoriteTitles(ids, mediaType);
      setSaved(true);
    });
  }

  return (
    <div>
      <p className="mb-3 text-[11px] uppercase tracking-wider text-foreground-muted">
        Your six favorites
      </p>
      {/* 3-2-1 podium: rank comes from POSITION (alone on top, pair in the
          middle, trio on the bottom), not from size — all six tiles are the
          same width. Each row is its own 6-column grid so a 1-item row, a
          2-item row, and a 3-item row all resolve to identical column
          widths (each tile spans 2 of 6 columns) and stay centered. */}
      <div className="mx-auto flex max-w-[480px] flex-col gap-3">
        <div className="grid grid-cols-6 gap-3">
          <div className="col-span-2 col-start-3">
            <FavoriteSlot
              fav={favorites[0]}
              label="#1"
              highlight
              onOpen={() => openSlot(0)}
              onRemove={() => removeSlot(0)}
            />
          </div>
        </div>
        <div className="grid grid-cols-6 gap-3">
          <div className="col-span-2 col-start-2">
            <FavoriteSlot fav={favorites[1]} onOpen={() => openSlot(1)} onRemove={() => removeSlot(1)} />
          </div>
          <div className="col-span-2 col-start-4">
            <FavoriteSlot fav={favorites[2]} onOpen={() => openSlot(2)} onRemove={() => removeSlot(2)} />
          </div>
        </div>
        <div className="grid grid-cols-6 gap-3">
          {[3, 4, 5].map((i) => (
            <div key={i} className="col-span-2">
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
