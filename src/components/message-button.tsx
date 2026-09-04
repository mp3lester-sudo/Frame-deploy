"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getOrCreateConversation } from "@/lib/actions/messages";
import { useToast } from "@/components/ui/toast";

export function MessageButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();

  return (
    <Button
      variant="secondary"
      isLoading={isPending}
      onClick={() =>
        startTransition(async () => {
          // Launch audit finding: getOrCreateConversation was unguarded --
          // a failed call just left the button idle again with no
          // navigation and no explanation of what happened.
          try {
            const conversationId = await getOrCreateConversation(userId);
            router.push(`/messages/${conversationId}`);
          } catch {
            showToast("Couldn't start a conversation — try again");
          }
        })
      }
    >
      Message
    </Button>
  );
}
