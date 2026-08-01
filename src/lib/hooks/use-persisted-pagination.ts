"use client";

import { useEffect, useState } from "react";

type PersistedState<T> = { items: T[]; hasMore: boolean; page: number; version?: string };

function readPersisted<T>(
  storageKey: string,
  fallback: PersistedState<T>,
  version: string | undefined
): PersistedState<T> {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedState<T>;
      // If the caller passed a version and it doesn't match what's cached,
      // the underlying data changed since this was stored (e.g. a bulk
      // import landed more ratings) — trust the fresh server-provided
      // first page instead of resurrecting a stale, now-undersized cache.
      // Without this, a page like /profile/[username]/watched would stay
      // stuck showing whatever was cached from the visitor's last visit
      // forever, since sessionStorage never expires within the tab.
      if (version === undefined || parsed.version === version) return parsed;
    }
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
export function usePersistedPagination<T>(
  storageKey: string,
  initialItems: T[],
  initialHasMore: boolean,
  version?: string
) {
  const [state, setState] = useState<PersistedState<T>>(() =>
    readPersisted(storageKey, { items: initialItems, hasMore: initialHasMore, page: 1, version }, version)
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
    setState((prev) => ({ items: [...prev.items, ...newItems], hasMore, page, version: prev.version }));
  }

  return { items: state.items, hasMore: state.hasMore, page: state.page, appendPage };
}
