"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { saveDiscoverPreset, deleteDiscoverPreset, type DiscoverFilterPreset } from "@/lib/actions/discover-presets";

export interface CurrentDiscoverFilters {
  genre?: string;
  era?: string;
  pacing?: string;
  tone?: string;
  mood?: string;
}

function hasAnyFilter(f: CurrentDiscoverFilters): boolean {
  return !!(f.genre || f.era || f.pacing || f.tone || f.mood);
}

function presetHref(p: DiscoverFilterPreset): string {
  const params = new URLSearchParams();
  if (p.genre) params.set("genre", p.genre);
  if (p.era) params.set("era", p.era);
  if (p.pacing) params.set("pacing", p.pacing);
  if (p.tone) params.set("tone", p.tone);
  if (p.mood) params.set("mood", p.mood);
  const qs = params.toString();
  return qs ? `/discover?${qs}` : "/discover";
}

/**
 * Auteur-exclusive (task #340) -- only rendered by discover/page.tsx when
 * isAuteurActive is true, though saveDiscoverPreset re-checks server-side
 * too (see that action's doc comment for why). Presets are just named
 * snapshots of the same genre/era/pacing/tone/mood params Discover's own
 * filter rail reads, so "applying" one is just a normal Link, no client
 * state to sync.
 */
export function SavedFilterPresets({
  presets,
  current,
}: {
  presets: DiscoverFilterPreset[];
  current: CurrentDiscoverFilters;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    startTransition(async () => {
      try {
        await saveDiscoverPreset({ name: trimmed, ...current });
        setNaming(false);
        setName("");
        showToast(`Saved "${trimmed}"`);
        router.refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Could not save preset");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteDiscoverPreset({ id });
        router.refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Could not delete preset");
      }
    });
  }

  if (presets.length === 0 && !hasAnyFilter(current)) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {presets.map((p) => (
        <span
          key={p.id}
          className="group flex items-center gap-1 rounded-[var(--radius-full)] border border-border bg-surface pl-3 pr-1.5 py-1 text-[11px]"
        >
          <Link href={presetHref(p)} className="text-foreground-muted hover:text-foreground">
            {p.name}
          </Link>
          <button
            type="button"
            aria-label={`Delete preset "${p.name}"`}
            disabled={isPending}
            onClick={() => handleDelete(p.id)}
            className="rounded-full p-0.5 text-foreground-muted opacity-60 hover:bg-border hover:text-foreground hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}

      {hasAnyFilter(current) &&
        (naming ? (
          <div className="flex items-center gap-1.5">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") setNaming(false);
              }}
              placeholder="Name this search"
              maxLength={40}
              className="h-7 w-40 text-[11px]"
            />
            <Button size="sm" onClick={handleSave} isLoading={isPending} disabled={!name.trim()}>
              Save
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setNaming(true)}
            className="rounded-[var(--radius-full)] border border-dashed border-border-strong px-3 py-1 text-[11px] text-foreground-muted hover:border-accent hover:text-accent"
          >
            + Save this search
          </button>
        ))}
    </div>
  );
}
