"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { sendMessage, type NewMessage } from "@/lib/actions/messages";
import { validateMessageBody } from "@/lib/messages/validate";
import { formatDistanceToNow } from "@/lib/date";
import { cn } from "@/lib/utils";

export interface DisplayMessage {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
}

export function MessageThread({
  conversationId,
  initialMessages,
  viewerId,
}: {
  conversationId: string;
  initialMessages: DisplayMessage[];
  viewerId: string;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validation = validateMessageBody(draft);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const message: NewMessage = await sendMessage(conversationId, validation.body);
        setMessages((prev) => [...prev, { id: message.id, senderId: message.sender_id, body: message.body, createdAt: message.created_at }]);
        setDraft("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to send message");
      }
    });
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-2">
        {messages.map((m) => {
          const mine = m.senderId === viewerId;
          return (
            <div key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
              <div
                className={cn(
                  "max-w-[75%] rounded-[var(--radius-md)] px-3 py-2 text-sm",
                  mine ? "bg-accent text-accent-foreground" : "border border-border bg-surface"
                )}
              >
                {m.body}
              </div>
              <span className="mt-0.5 text-[11px] text-foreground-muted">{formatDistanceToNow(m.createdAt)}</span>
            </div>
          );
        })}
        {messages.length === 0 && <p className="text-sm text-foreground-muted">Say hello.</p>}
      </div>

      <form onSubmit={handleSubmit} className="mt-4 flex items-start gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a message…"
          rows={2}
          className="flex-1 resize-y rounded-[var(--radius-md)] border border-border bg-surface-raised px-3 py-2 text-sm placeholder:text-foreground-muted/60 focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <Button type="submit" isLoading={isPending} disabled={!draft.trim()}>
          Send
        </Button>
      </form>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
