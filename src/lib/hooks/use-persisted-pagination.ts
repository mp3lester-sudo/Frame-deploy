"use client";

import { useEffect, useState } from "react";

type PersistedState<T> = { items: T[]; hasMore: boolean; page: number };

function readPersisted<T>(storageKey: string, fallback: PersistedState<T>): PersistedState<T> {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (raw) return JSON.parse(raw) as PersistedState<T>;
  } catch {
    // Corrupt JSON or storage unavailable (e.g. private browsing quota) —
    // fall through to the server-provided first page rather than throwing.
  }
  return fallback;
}

/**
 * Discover and Search's "Load more" grids kept their loaded titles in
 * plain useState, which only lives as long as the component is mounted.
 * Both routes read cookies for auth/personalization (is_premium, etc.),
 * which makes them fully dynamic — Next's Router Cache can't safely
 * restore a cached render for those routes on browser back/forward, so
 * every back-navigation was a fresh server render that reset the grid to
 * page 1, discarding everything a "Load more" click had built up and
 * dropping the user back at the top of the page.
 *
 * This persists {items, hasMore, page} to sessionStorage under a caller-
 * supplied key (scoped per filter/query combo — see discover/page.tsx and
 * search/page.tsx) and rehydrates from it synchronously on mount, so
 * returning via back lands exactly where the user left off, scroll
 * position included (the browser's native scroll restoration lines up
 * correctly once the full previously-loaded content height is back).
 * Session-scoped rather than localStorage since this is throwaway
 * navigation state, not something that should survive a new tab.
 */
export function usePersistedPagination<T>(storageKey: string, initialItems: T[], initialHasMore: boolean) {
  const [state, setState] = useState<PersistedState<T>>(() =>
    readPersisted(storageKey, { items: initialItems, hasMore: initialHasMore, page: 1 })
  );

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // Storage full/unavailable — state still works for this page view,
      // it just won't survive navigation away and back.
    }
  }, [storageKey, state]);

  function appendPage(newItems: T[], hasMore: boolean, page: number) {
    setState((prev) => ({ items: [...prev.items, ...newItems], hasMore, page }));
  }

  return { items: state.items, hasMore: state.hasMore, page: state.page, appendPage };
}
