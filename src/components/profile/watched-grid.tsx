"use client";

import { useTransition } from "react";
import { WatchedTitleCard } from "@/components/profile/watched-title-card";
import { Button } from "@/components/ui/button";
import { usePersistedPagination } from "@/lib/hooks/use-persisted-pagination";
import { loadMoreWatchedTitles, type WatchedRow } from "@/lib/actions/watched";
import type { MediaType } from "@/lib/context/media-type-cookie";

/**
 * Full paginated version of the profile page's "Recently watched" teaser
 * grid — same WatchedTitleCard (rating shown, removable on your own
 * profile), but "Load more" instead of a hard 12-item cap.
 */
export function WatchedGrid({
  username,
  mediaType,
  isOwnProfile,
  initialRows,
  initialHasMore,
  totalCount,
}: {
  username: string;
  mediaType: MediaType;
  isOwnProfile: boolean;
  initialRows: WatchedRow[];
  initialHasMore: boolean;
  totalCount: number;
}) {
  // mediaType is part of the storage key for the same reason Discover's and
  // Search's LoadMoreGrid keys needed it: without it, toggling Movies<->Shows
  // with no other state change collapses to the same sessionStorage key and
  // restores the other tab's stale rows.
  const { items: rows, hasMore, page, appendPage } = usePersistedPagination(
    `watched:${mediaType}:${username}`,
    initialRows,
    initialHasMore,
    // Invalidates the sessionStorage cache whenever the total number of
    // ratings changes (e.g. a Letterboxd import lands after this visitor's
    // last visit) — see usePersistedPagination's version param.
    String(totalCount)
  );
  const [isPending, startTransition] = useTransition();

  function handleLoadMore() {
    const next = page + 1;
    startTransition(async () => {
      const result = await loadMoreWatchedTitles(username, mediaType, next);
      appendPage(result.rows, result.hasMore, next);
    });
  }

  if (!rows.length) {
    return <p className="mt-8 text-sm text-foreground-muted">Nothing rated yet.</p>;
  }

  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
        {rows.map((r) => (
          <WatchedTitleCard key={r.title.id} title={r.title} reason={`Rated ${r.score}/5`} canRemove={isOwnProfile} />
        ))}
      </div>
      {hasMore && (
        <div className="mt-6 flex justify-center">
          <Button variant="secondary" onClick={handleLoadMore} isLoading={isPending}>
            Load more
          </Button>
        </div>
      )}
    </>
  );
}
