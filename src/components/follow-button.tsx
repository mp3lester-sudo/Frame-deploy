"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toggleFollow } from "@/lib/actions/social";
import { posthog } from "@/lib/analytics/posthog-client";
import { useToast } from "@/components/ui/toast";

export function FollowButton({ userId, initiallyFollowing }: { userId: string; initiallyFollowing: boolean }) {
  const [following, setFollowing] = useState(initiallyFollowing);
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();

  // Launch audit finding: this call was unguarded -- a failed
  // toggleFollow left the button showing "Following" (or reverted to
  // "Follow") with zero indication anything went wrong and no revert,
  // the one social action in the app with no error handling at all.
  function handleClick() {
    const next = !following;
    setFollowing(next);
    if (next) posthog.capture("user_followed", { followee_id: userId });
    startTransition(async () => {
      try {
        await toggleFollow(userId);
      } catch {
        setFollowing(!next);
        showToast("Couldn't update follow status — try again");
      }
    });
  }

  return (
    <Button variant={following ? "secondary" : "primary"} size="sm" isLoading={isPending} onClick={handleClick}>
      {following ? "Following" : "Follow"}
    </Button>
  );
}
