"use client";

import { useState, useTransition } from "react";
import { UserResultCard } from "@/components/user-result-card";
import { Button } from "@/components/ui/button";
import type { UserSearchResult } from "@/lib/actions/users";

export function LoadMorePeople({
  initialUsers,
  initialHasMore,
  loadMore,
}: {
  initialUsers: UserSearchResult[];
  initialHasMore: boolean;
  loadMore: (page: number) => Promise<{ users: UserSearchResult[]; hasMore: boolean }>;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();

  function handleLoadMore() {
    const next = page + 1;
    startTransition(async () => {
      const result = await loadMore(next);
      setUsers((prev) => [...prev, ...result.users]);
      setHasMore(result.hasMore);
      setPage(next);
    });
  }

  if (!users.length) return null;

  return (
    <>
      <div className="rounded-[var(--radius-md)] border border-border bg-surface px-4">
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
