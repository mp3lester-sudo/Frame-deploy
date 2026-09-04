"use client";

import { useTransition } from "react";
import { UserResultCard } from "@/components/user-result-card";
import { Button } from "@/components/ui/button";
import { usePersistedPagination } from "@/lib/hooks/use-persisted-pagination";
import type { UserSearchResult } from "@/lib/actions/users";

export function LoadMorePeople({
  storageKey,
  initialUsers,
  initialHasMore,
  loadMore,
}: {
  /** Unique per query so a fresh search doesn't inherit a stale one's loaded state. */
  storageKey: string;
  initialUsers: UserSearchResult[];
  initialHasMore: boolean;
  loadMore: (page: number) => Promise<{ users: UserSearchResult[]; hasMore: boolean }>;
}) {
  const { items: users, hasMore, page, appendPage } = usePersistedPagination(storageKey, initialUsers, initialHasMore);
  const [isPending, startTransition] = useTransition();

  function handleLoadMore() {
    const next = page + 1;
    startTransition(async () => {
      const result = await loadMore(next);
      appendPage(result.users, result.hasMore, next);
    });
  }

  if (!users.length) return null;

  return (
    <>
      <div className="flex flex-col gap-2">
        {users.map((u) => (
          <UserResultCard key={u.id} user={u} />
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
