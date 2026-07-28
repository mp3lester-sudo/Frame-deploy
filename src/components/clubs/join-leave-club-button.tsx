"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { joinClub, leaveClub } from "@/lib/actions/clubs";

export function JoinLeaveClubButton({
  clubId,
  initiallyMember,
  isOwner,
}: {
  clubId: string;
  initiallyMember: boolean;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [isMember, setIsMember] = useState(initiallyMember);
  const [isPending, startTransition] = useTransition();

  if (isOwner) return null; // the owner can't leave their own club (no ownership transfer yet)

  return (
    <Button
      variant={isMember ? "secondary" : "primary"}
      isLoading={isPending}
      onClick={() =>
        startTransition(async () => {
          if (isMember) {
            await leaveClub(clubId);
            setIsMember(false);
          } else {
            await joinClub(clubId);
            setIsMember(true);
          }
          router.refresh();
        })
      }
    >
      {isMember ? "Leave club" : "Join club"}
    </Button>
  );
}
