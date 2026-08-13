import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { Avatar } from "@/components/ui/avatar";

export default async function MessagesPage() {
  const supabase = await createClient();
  const viewer = await getVerifiedUser();
  if (!viewer) redirect("/login?next=/messages");

  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, user_a, user_b, created_at")
    .or(`user_a.eq.${viewer.id},user_b.eq.${viewer.id}`)
    .order("created_at", { ascending: false });

  const rows = await Promise.all(
    (conversations ?? []).map(async (c) => {
      const otherId = c.user_a === viewer.id ? c.user_b : c.user_a;
      const [{ data: profile }, { data: lastMessage }, { count: unreadCount }] = await Promise.all([
        supabase.from("profiles").select("username, display_name, avatar_url").eq("id", otherId).maybeSingle(),
        supabase
          .from("messages")
          .select("body, created_at, sender_id")
          .eq("conversation_id", c.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("conversation_id", c.id)
          .neq("sender_id", viewer.id)
          .is("read_at", null),
      ]);
      return { conversationId: c.id, profile, lastMessage, unreadCount: unreadCount ?? 0 };
    })
  );

  // Conversations with no messages yet (just started) sort after ones with
  // activity, most-recent-message first.
  rows.sort((a, b) => {
    const aTime = a.lastMessage?.created_at ?? "";
    const bTime = b.lastMessage?.created_at ?? "";
    return bTime.localeCompare(aTime);
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-display mb-6 text-2xl">Messages</h1>

      {rows.length === 0 ? (
        <p className="text-sm text-foreground-muted">
          No conversations yet — visit someone&apos;s profile and hit &ldquo;Message&rdquo; to start one.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <Link
              key={r.conversationId}
              href={`/messages/${r.conversationId}`}
              className="bento-card flex items-center gap-3 p-3"
            >
              <Avatar name={r.profile?.display_name ?? r.profile?.username ?? "?"} src={r.profile?.avatar_url} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.profile?.display_name ?? r.profile?.username ?? "Unknown"}</p>
                <p className="truncate text-xs text-foreground-muted">
                  {r.lastMessage?.body ?? "No messages yet"}
                </p>
              </div>
              {r.unreadCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-medium text-accent-foreground">
                  {r.unreadCount}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
