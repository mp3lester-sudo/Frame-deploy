"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getOrCreateConversation } from "@/lib/actions/messages";

export function MessageButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="secondary"
      isLoading={isPending}
      onClick={() =>
        startTransition(async () => {
          const conversationId = await getOrCreateConversation(userId);
          router.push(`/messages/${conversationId}`);
        })
      }
    >
      Message
    </Button>
  );
}
