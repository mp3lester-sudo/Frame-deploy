"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toggleFollow } from "@/lib/actions/social";
import { posthog } from "@/lib/analytics/posthog-client";

export function FollowButton({ userId, initiallyFollowing }: { userId: string; initiallyFollowing: boolean }) {
  const [following, setFollowing] = useState(initiallyFollowing);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const next = !following;
    setFollowing(next);
    if (next) posthog.capture("user_followed", { followee_id: userId });
    startTransition(async () => {
      await toggleFollow(userId);
    });
  }

  return (
    <Button variant={following ? "secondary" : "primary"} size="sm" isLoading={isPending} onClick={handleClick}>
      {following ? "Following" : "Follow"}
    </Button>
  );
}
