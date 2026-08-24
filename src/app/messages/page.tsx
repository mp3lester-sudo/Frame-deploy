import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { Avatar } from "@/components/ui/avatar";
import { MessageButton } from "@/components/message-button";
import { buildSuggestedContacts, type SuggestedContact } from "@/lib/messages/suggest-contacts";

export default async function MessagesPage() {
  const supabase = await createClient();
  const viewer = await getVerifiedUser();
  if (!viewer) redirect("/login?next=/messages");

  // Capped at 100 -- a dedicated paginated/archived view would be the
  // right place for anything beyond that, not this page.
  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, user_a, user_b, created_at")
    .or(`user_a.eq.${viewer.id},user_b.eq.${viewer.id}`)
    .order("created_at", { ascending: false })
    .limit(100);

  const conversationIds = (conversations ?? []).map((c) => c.id);
  const otherIds = [...new Set((conversations ?? []).map((c) => (c.user_a === viewer.id ? c.user_b : c.user_a)))];

  // Used to fan out 3 queries PER conversation (profile, last message,
  // unread count) -- up to 300 concurrent round trips for a full inbox.
  // Batched into 3 queries total instead, each scoped to every
  // conversation at once, then reduced in memory below.
  //
  // Suggested-contacts data (personalization audit item #6) is fetched
  // alongside these -- it doesn't depend on the conversation list at all,
  // just the viewer's own id, so there's no reason to wait for the
  // conversation queries to resolve first.
  const [{ data: profiles }, { data: recentMessages }, { data: unreadRows }, { data: compatibilityShares }, { data: myNights }, { data: blocks }] =
    await Promise.all([
      otherIds.length
        ? supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", otherIds)
        : Promise.resolve({ data: [] as { id: string; username: string; display_name: string | null; avatar_url: string | null }[] }),
      // No per-conversation "last row" query exists without a dedicated RPC,
      // so this pulls the most recent messages across ALL of this viewer's
      // conversations at once (capped well above what 100 active threads
      // would realistically need) and keeps only the first (= most recent,
      // already sorted desc) row per conversation_id below -- equivalent
      // result to the old per-conversation query for any normal inbox.
      conversationIds.length
        ? supabase
            .from("messages")
            .select("conversation_id, body, created_at, sender_id")
            .in("conversation_id", conversationIds)
            .order("created_at", { ascending: false })
            .limit(500)
        : Promise.resolve({ data: [] as { conversation_id: string; body: string; created_at: string; sender_id: string }[] }),
      conversationIds.length
        ? supabase
            .from("messages")
            .select("conversation_id")
            .in("conversation_id", conversationIds)
            .neq("sender_id", viewer.id)
            .is("read_at", null)
        : Promise.resolve({ data: [] as { conversation_id: string }[] }),
      // High-compatibility matches: reuses compatibility_shares
      // (migration 0083), populated whenever the viewer has shared a
      // TasteCompatibilityCard with someone -- no fresh compatibility
      // scoring needed here.
      supabase
        .from("compatibility_shares")
        .select("other_id, percent")
        .eq("viewer_id", viewer.id)
        .order("percent", { ascending: false })
        .limit(20),
      // Movie Night co-participants: which nights was the viewer part of.
      supabase.from("movie_night_participants").select("movie_night_id").eq("user_id", viewer.id),
      // Who the viewer has blocked -- excluded from suggestions same as
      // getOrCreateConversation excludes them from new conversations.
      supabase.from("user_blocks").select("blocked_id").eq("blocker_id", viewer.id),
    ]);

  const myNightIds = [...new Set((myNights ?? []).map((n) => n.movie_night_id))];
  // Second query genuinely depends on the first (which nights the viewer
  // is even part of) -- same sequential-but-not-per-row shape as
  // getDirectorOfTheDay's ratings-then-credits fetch.
  const { data: coParticipantRows } = myNightIds.length
    ? await supabase
        .from("movie_night_participants")
        .select("user_id, joined_at")
        .in("movie_night_id", myNightIds)
        .neq("user_id", viewer.id)
    : { data: [] as { user_id: string; joined_at: string }[] };

  const excludeUserIds = new Set<string>([viewer.id, ...otherIds, ...(blocks ?? []).map((b) => b.blocked_id)]);
  const suggestions = buildSuggestedContacts(
    (compatibilityShares ?? []).map((s) => ({ userId: s.other_id, percent: s.percent })),
    (coParticipantRows ?? []).map((r) => ({ userId: r.user_id, joinedAt: r.joined_at })),
    excludeUserIds
  );

  const suggestedUserIds = suggestions.map((s) => s.userId);
  const { data: suggestedProfiles } = suggestedUserIds.length
    ? await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", suggestedUserIds)
    : { data: [] as { id: string; username: string; display_name: string | null; avatar_url: string | null }[] };
  const suggestedProfileById = new Map((suggestedProfiles ?? []).map((p) => [p.id, p]));

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const lastMessageByConversation = new Map<string, { body: string; created_at: string; sender_id: string }>();
  for (const m of recentMessages ?? []) {
    if (!lastMessageByConversation.has(m.conversation_id)) lastMessageByConversation.set(m.conversation_id, m);
  }
  const unreadCountByConversation = new Map<string, number>();
  for (const row of unreadRows ?? []) {
    unreadCountByConversation.set(row.conversation_id, (unreadCountByConversation.get(row.conversation_id) ?? 0) + 1);
  }

  const rows = (conversations ?? []).map((c) => {
    const otherId = c.user_a === viewer.id ? c.user_b : c.user_a;
    return {
      conversationId: c.id,
      profile: profileById.get(otherId) ?? null,
      lastMessage: lastMessageByConversation.get(c.id) ?? null,
      unreadCount: unreadCountByConversation.get(c.id) ?? 0,
    };
  });

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

      {suggestions.length > 0 && (
        <SuggestedContactsRow
          suggestions={suggestions}
          profileById={suggestedProfileById}
        />
      )}

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

type SuggestedProfile = { id: string; username: string; display_name: string | null; avatar_url: string | null };

/** "People you might want to message" -- high compatibility matches and
 *  recent Movie Night co-participants (see suggest-contacts.ts). Kept as
 *  a horizontal-scroll row of small cards, distinct from the main
 *  conversation list below it, so it reads as a discovery surface rather
 *  than something that could be mistaken for an existing thread. */
function SuggestedContactsRow({
  suggestions,
  profileById,
}: {
  suggestions: SuggestedContact[];
  profileById: Map<string, SuggestedProfile>;
}) {
  return (
    <div className="mb-6">
      <p className="mb-2 text-[11px] uppercase tracking-wider text-foreground-muted">People you might want to message</p>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {suggestions.map((s) => {
          const profile = profileById.get(s.userId);
          if (!profile) return null;
          const name = profile.display_name ?? profile.username;
          const label =
            s.reason === "compatibility" ? `${s.detail}% compatible` : "Watched together recently";
          return (
            <div key={s.userId} className="bento-card flex w-40 shrink-0 flex-col items-center gap-2 p-3 text-center">
              <Link href={`/profile/${profile.username}`}>
                <Avatar name={name} src={profile.avatar_url} size={48} />
              </Link>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{name}</p>
                <p className="truncate text-[11px] text-foreground-muted">{label}</p>
              </div>
              <MessageButton userId={s.userId} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
