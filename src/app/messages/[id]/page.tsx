import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { Avatar } from "@/components/ui/avatar";
import { MessageThread, type DisplayMessage } from "@/components/messages/message-thread";
import { markConversationRead } from "@/lib/actions/messages";
import { ReportButton } from "@/components/moderation/report-button";
import { BlockUserButton } from "@/components/moderation/block-user-button";
import { getBlockStatus } from "@/lib/actions/moderation";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const viewer = await getVerifiedUser();
  if (!viewer) redirect(`/login?next=/messages/${id}`);

  const { data: conversation } = await supabase.from("conversations").select("*").eq("id", id).maybeSingle();
  // RLS already scopes this to conversations the viewer is part of, so a
  // conversation belonging to someone else comes back as "not found" rather
  // than leaking that it exists.
  if (!conversation) notFound();

  const otherId = conversation.user_a === viewer.id ? conversation.user_b : conversation.user_a;
  const { data: otherProfile } = await supabase
    .from("profiles")
    .select("username, display_name, avatar_url")
    .eq("id", otherId)
    .maybeSingle();

  const { data: messageRows } = await supabase
    .from("messages")
    .select("id, sender_id, body, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  const messages: DisplayMessage[] = (messageRows ?? []).map((m) => ({
    id: m.id,
    senderId: m.sender_id,
    body: m.body,
    createdAt: m.created_at,
  }));

  await markConversationRead(id);
  const { blocked } = await getBlockStatus(otherId);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/messages" className="text-sm text-foreground-muted hover:text-accent">
          &larr;
        </Link>
        <Avatar name={otherProfile?.display_name ?? otherProfile?.username ?? "?"} src={otherProfile?.avatar_url} size={36} />
        <Link href={`/profile/${otherProfile?.username ?? ""}`} className="font-medium hover:text-accent">
          {otherProfile?.display_name ?? otherProfile?.username ?? "Unknown"}
        </Link>
        <div className="ml-auto flex items-center gap-3">
          <ReportButton contentType="profile" contentId={otherId} />
          <BlockUserButton userId={otherId} initiallyBlocked={blocked} />
        </div>
      </div>

      <MessageThread conversationId={id} initialMessages={messages} viewerId={viewer.id} />
    </div>
  );
}
