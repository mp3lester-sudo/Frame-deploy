import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { Avatar } from "@/components/ui/avatar";
import { markAllNotificationsRead } from "@/lib/actions/notifications";
import { formatDistanceToNow } from "@/lib/date";
import type { Database } from "@/lib/supabase/types";

type NotificationType = Database["public"]["Tables"]["notifications"]["Row"]["type"];

/** Where the notification's row should link to, and the message shown for each type. */
function describe(
  type: NotificationType,
  actorName: string,
  titleName: string | null
): { message: string } {
  switch (type) {
    case "follow":
      return { message: `${actorName} started following you.` };
    case "comment":
      return { message: `${actorName} commented on your review${titleName ? ` of ${titleName}` : ""}.` };
    case "reaction":
      return { message: `${actorName} reacted to your review${titleName ? ` of ${titleName}` : ""}.` };
    case "movie_night_invite":
      return { message: `${actorName} invited you to a Movie Night.` };
    case "movie_night_decided":
      return { message: `Movie Night picked ${titleName ?? "a title"}.` };
  }
}

function linkFor(
  type: NotificationType,
  actorUsername: string | null,
  titleId: string | null,
  refId: string | null
): string {
  switch (type) {
    case "follow":
      return actorUsername ? `/profile/${actorUsername}` : "/notifications";
    case "comment":
    case "reaction":
      return titleId ? `/movie/${titleId}` : "/notifications";
    case "movie_night_invite":
    case "movie_night_decided":
      return refId ? `/movie-night/${refId}` : "/movie-night";
  }
}

export default async function NotificationsPage() {
  const supabase = await createClient();
  const viewer = await getVerifiedUser();
  if (!viewer) redirect("/login?next=/notifications");

  const { data: rows } = await supabase
    .from("notifications")
    .select(
      "id, type, title_id, ref_id, read_at, created_at, actor:profiles!notifications_actor_id_fkey(username, display_name, avatar_url), title:titles(name)"
    )
    .eq("recipient_id", viewer.id)
    .order("created_at", { ascending: false })
    .limit(50);

  // Marks everything as read once the viewer has actually loaded this page
  // (mirrors markConversationRead's pattern in messages.ts) — the rows
  // below still render with their read_at as fetched above, so the unread
  // highlight remains visible for this render even though the badge in the
  // nav will clear on the next navigation.
  await markAllNotificationsRead();

  const notifications = rows ?? [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Notifications</h1>

      {notifications.length === 0 ? (
        <p className="text-sm text-foreground-muted">
          Nothing yet. Follows, comments, reactions, and Movie Night invites will show up here.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {notifications.map((n) => {
            const actor = (n as unknown as {
              actor: { username: string; display_name: string | null; avatar_url: string | null } | null;
            }).actor;
            const title = (n as unknown as { title: { name: string } | null }).title;
            const actorName = actor?.display_name || actor?.username || "Someone";
            const { message } = describe(n.type, actorName, title?.name ?? null);
            const href = linkFor(n.type, actor?.username ?? null, n.title_id, n.ref_id);
            const unread = !n.read_at;

            return (
              <li key={n.id}>
                <Link
                  href={href}
                  className={`flex items-center gap-3 py-3 hover:bg-surface-raised ${unread ? "bg-surface-raised/40" : ""}`}
                >
                  <Avatar src={actor?.avatar_url} name={actorName} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">{message}</p>
                    <p className="text-xs text-foreground-muted">{formatDistanceToNow(n.created_at)}</p>
                  </div>
                  {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
