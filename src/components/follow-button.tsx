"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toggleFollow } from "@/lib/actions/social";

export function FollowButton({ userId, initiallyFollowing }: { userId: string; initiallyFollowing: boolean }) {
  const [following, setFollowing] = useState(initiallyFollowing);
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant={following ? "secondary" : "primary"}
      size="sm"
      isLoading={isPending}
      onClick={() =>
        startTransition(async () => {
          setFollowing((f) => !f);
          await toggleFollow(userId);
        })
      }
    >
      {following ? "Following" : "Follow"}
    </Button>
  );
}
