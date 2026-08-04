"use client";

import { useTransition } from "react";
import { CastCrewResultCard } from "@/components/cast-crew-result-card";
import { Button } from "@/components/ui/button";
import { usePersistedPagination } from "@/lib/hooks/use-persisted-pagination";
import type { CastCrewSearchResult } from "@/lib/actions/cast-crew";

export function LoadMoreCastCrew({
  storageKey,
  initialPeople,
  initialHasMore,
  loadMore,
}: {
  storageKey: string;
  initialPeople: CastCrewSearchResult[];
  initialHasMore: boolean;
  loadMore: (page: number) => Promise<{ people: CastCrewSearchResult[]; hasMore: boolean }>;
}) {
  const { items: people, hasMore, page, appendPage } = usePersistedPagination(storageKey, initialPeople, initialHasMore);
  const [isPending, startTransition] = useTransition();

  function handleLoadMore() {
    const next = page + 1;
    startTransition(async () => {
      const result = await loadMore(next);
      appendPage(result.people, result.hasMore, next);
    });
  }

  if (!people.length) return null;

  return (
    <>
      <div className="rounded-[var(--radius-md)] border border-border bg-surface px-4">
        {people.map((p) => (
          <CastCrewResultCard key={p.id} person={p} />
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
