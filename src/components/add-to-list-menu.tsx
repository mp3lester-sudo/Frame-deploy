"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ListPlus, Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addTitleToList, removeTitleFromList, createList } from "@/lib/actions/lists";

export interface AddToListMenuList {
  id: string;
  title: string;
  hasTitle: boolean;
}

/**
 * The Letterboxd-style "Add to list" control on a movie page: a dropdown of
 * the viewer's own lists (checkbox per list, toggling membership), plus an
 * inline "new list" form so a list can be created and populated in one
 * motion without leaving the movie page. Separate from WatchlistButton,
 * matching Letterboxd's own split between the single default Watchlist and
 * any number of named custom lists.
 */
export function AddToListMenu({ titleId, lists }: { titleId: string; lists: AddToListMenuList[] }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(lists);
  const [creating, setCreating] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
        setError(null);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function toggleList(listId: string, currentlyHas: boolean) {
    setItems((prev) => prev.map((l) => (l.id === listId ? { ...l, hasTitle: !currentlyHas } : l)));
    startTransition(async () => {
      try {
        if (currentlyHas) {
          await removeTitleFromList({ listId, titleId });
        } else {
          await addTitleToList({ listId, titleId });
        }
      } catch (err) {
        setItems((prev) => prev.map((l) => (l.id === listId ? { ...l, hasTitle: currentlyHas } : l)));
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newListName.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        const listId = await createList({ title: newListName, isPublic: true });
        await addTitleToList({ listId, titleId });
        setItems((prev) => [...prev, { id: listId, title: newListName.trim(), hasTitle: true }]);
        setNewListName("");
        setCreating(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't create that list");
      }
    });
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>
        <ListPlus size={14} />
        Add to list
      </Button>

      {open && (
        <>
          {/* Mobile audit finding #6: this panel used to be a plain
              `absolute left-0 top-full w-64` dropdown -- on a 375-390px
              iPhone that 256px-wide panel can run past the right edge of
              the screen depending on where the trigger button happens to
              sit in the movie page's action row, and it read exactly like
              a desktop context menu that happened to render on a phone
              (closes on a `mousedown` document listener, no backdrop, no
              native affordance). Below md:, it's now a real bottom sheet
              -- fixed to the viewport bottom, full width, safe-area-aware,
              with a dimming backdrop -- the same treatment a native app
              would give a multi-select list picker. md: reverts to the
              original anchored dropdown, since desktop has no equivalent
              "off-screen" risk and the dropdown is the more efficient
              pattern there. */}
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            aria-hidden="true"
            onClick={() => {
              setOpen(false);
              setCreating(false);
              setError(null);
            }}
          />
          <div className="fixed inset-x-0 bottom-0 z-50 max-h-[70vh] overflow-y-auto rounded-t-[var(--radius-lg)] border-t border-border bg-surface-raised p-3 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-lg md:absolute md:inset-x-auto md:inset-y-auto md:bottom-auto md:left-0 md:top-full md:z-20 md:mt-2 md:max-h-none md:w-64 md:rounded-t-[var(--radius-md)] md:border md:p-2 md:pb-2">
          {items.length === 0 && !creating && (
            <p className="px-2 py-1.5 text-xs text-foreground-muted">You don&apos;t have any lists yet.</p>
          )}
          <ul className="max-h-48 overflow-y-auto">
            {items.map((list) => (
              <li key={list.id}>
                <button
                  type="button"
                  onClick={() => toggleList(list.id, list.hasTitle)}
                  disabled={isPending}
                  className="flex w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-sm hover:bg-surface disabled:opacity-60"
                >
                  <span className="truncate">{list.title}</span>
                  {list.hasTitle && <Check size={14} className="shrink-0 text-accent" />}
                </button>
              </li>
            ))}
          </ul>

          {error && <p className="px-2 pt-1 text-xs text-danger">{error}</p>}

          <div className="mt-1 border-t border-border pt-1">
            {creating ? (
              <form onSubmit={handleCreate} className="flex items-center gap-1 px-1 py-1">
                <Input
                  autoFocus
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="New list name"
                  className="h-8 text-xs"
                />
                <Button type="submit" size="sm" isLoading={isPending} disabled={!newListName.trim()}>
                  Add
                </Button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-sm text-accent hover:bg-surface"
              >
                <Plus size={14} />
                New list
              </button>
            )}
          </div>
          </div>
        </>
      )}
    </div>
  );
}
