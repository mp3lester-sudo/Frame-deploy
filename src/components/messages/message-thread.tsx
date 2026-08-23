"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
  // Mobile audit finding #5: nothing scrolled the thread to the newest
  // message on its own -- opening a long conversation dropped you
  // wherever the page happened to render, same as any plain webpage.
  // Every native/expected chat UI (iMessage, WhatsApp, DMs) opens
  // already scrolled to the latest message and jumps there again after
  // you send one; this sentinel + effect is the standard way to get
  // that without a virtualized-list library. "auto" (not "smooth") on
  // purpose -- a smooth-scroll animation on first mount of a long
  // thread reads as sluggish, not polished; it only needs to feel
  // instant on open, same as opening a real chat app.
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

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
      {/* pb-28 reserves room for the sticky composer below so the last
          message or two are never left sitting underneath it once the
          thread is scrolled all the way down -- the composer's own
          rough footprint (its height + the BottomNav gap it sticks
          above) is comfortably inside that buffer. */}
      <div className="flex flex-col gap-2 pb-28 md:pb-0">
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
        <div ref={bottomRef} />
      </div>

      {/* Mobile audit finding #5: this used to be a plain in-flow block
          at the bottom of the page -- on a long thread you had to
          scroll down past the whole history (and past the shared
          NavBar) just to find it, and it wasn't pinned above the
          keyboard or the bottom tab bar the way any real chat app's
          input bar is. `bottom` reuses the exact same
          "3.5rem + safe-area-inset-bottom" expression the root layout
          already reserves for BottomNav (see layout.tsx's <main>
          padding and bottom-nav.tsx) -- so the composer sticks flush
          against the top edge of the tab bar, never overlapping it,
          on every device including notched iPhones. The scrolling
          ancestor sticky resolves against here is whichever one
          actually scrolls (in this layout, that's the page itself),
          so this works without the conversation needing its own
          fixed-height inner scroll container. */}
      <form
        onSubmit={handleSubmit}
        className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 -mx-4 flex items-start gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-md md:static md:mx-0 md:mt-4 md:border-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a message…"
          rows={2}
          className="flex-1 resize-y rounded-[var(--radius-md)] border border-border bg-surface-raised px-3 py-2 text-base sm:text-sm placeholder:text-foreground-muted/60 focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <Button type="submit" isLoading={isPending} disabled={!draft.trim()}>
          Send
        </Button>
      </form>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
