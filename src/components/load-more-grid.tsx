"use client";

import { useTransition } from "react";
import { TitleCard } from "@/components/title-card";
import { Button } from "@/components/ui/button";
import { usePersistedPagination } from "@/lib/hooks/use-persisted-pagination";
import type { Database } from "@/lib/supabase/types";

type Title = Database["public"]["Tables"]["titles"]["Row"];

export function LoadMoreGrid({
  storageKey,
  initialTitles,
  initialHasMore,
  loadMore,
}: {
  /** Unique per filter/query combo so a fresh search doesn't inherit a stale one's loaded state. */
  storageKey: string;
  initialTitles: Title[];
  initialHasMore: boolean;
  loadMore: (page: number) => Promise<{ titles: Title[]; hasMore: boolean }>;
}) {
  const { items: titles, hasMore, page, appendPage } = usePersistedPagination(storageKey, initialTitles, initialHasMore);
  const [isPending, startTransition] = useTransition();

  function handleLoadMore() {
    const next = page + 1;
    startTransition(async () => {
      const result = await loadMore(next);
      appendPage(result.titles, result.hasMore, next);
    });
  }

  if (!titles.length) return null;

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
        {titles.map((t) => (
          <TitleCard key={t.id} title={t} />
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
