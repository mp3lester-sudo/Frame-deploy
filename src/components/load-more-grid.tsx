"use client";

import { useState, useTransition } from "react";
import { TitleCard } from "@/components/title-card";
import { Button } from "@/components/ui/button";
import type { Database } from "@/lib/supabase/types";

type Title = Database["public"]["Tables"]["titles"]["Row"];

export function LoadMoreGrid({
  initialTitles,
  initialHasMore,
  loadMore,
}: {
  initialTitles: Title[];
  initialHasMore: boolean;
  loadMore: (page: number) => Promise<{ titles: Title[]; hasMore: boolean }>;
}) {
  const [titles, setTitles] = useState(initialTitles);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();

  function handleLoadMore() {
    const next = page + 1;
    startTransition(async () => {
      const result = await loadMore(next);
      setTitles((prev) => [...prev, ...result.titles]);
      setHasMore(result.hasMore);
      setPage(next);
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
