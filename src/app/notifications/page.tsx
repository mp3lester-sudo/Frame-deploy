import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { Avatar } from "@/components/ui/avatar";
import { markAllNotificationsRead } from "@/lib/actions/notifications";
import { formatDistanceToNow } from "@/lib/date";
import type { Database } from "@/lib/supabase/types";

type NotificationType = Database["public"]["Tables"]["notifications"]["Row"]["type"];
type ActorInfo = { username: string; display_name: string | null; avatar_url: string | null };

/** The message shown for each notification type. */
function describe(type: NotificationType, actorName: string, titleName: string | null): string {
  switch (type) {
    case "follow":
      return `${actorName} started following you.`;
    case "comment":
      return `${actorName} commented on your review${titleName ? ` of ${titleName}` : ""}.`;
    case "reaction":
      return `${actorName} reacted to your review${titleName ? ` of ${titleName}` : ""}.`;
    case "movie_night_invite":
      return `${actorName} invited you to a Movie Night.`;
    case "movie_night_decided":
      return `Movie Night picked ${titleName ?? "a title"}.`;
  }
}

function linkFor(type: NotificationType, actorUsername: string | null, titleId: string | null, refId: string | null): string {
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

  // TEMP DIAGNOSTIC — whole body wrapped to surface the real 500 cause,
  // remove once root-caused.
  try {
    return await renderNotifications(supabase, viewer.id);
  } catch (err) {
    const e = err as { message?: string; stack?: string; digest?: string };
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-4 text-2xl font-semibold">Notifications (diagnostic)</h1>
        <pre className="whitespace-pre-wrap text-xs text-danger">
          {JSON.stringify({ message: e?.message, digest: e?.digest, stack: e?.stack }, null, 2)}
        </pre>
      </div>
    );
  }
}

async function renderNotifications(supabase: Awaited<ReturnType<typeof createClient>>, viewerId: string) {
  const { data: rows, error: rowsError } = await supabase
    .from("notifications")
    .select("id, type, actor_id, title_id, ref_id, read_at, created_at")
    .eq("recipient_id", viewerId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (rowsError) throw new Error(`notifications select failed: ${JSON.stringify(rowsError)}`);

  const notifications = rows ?? [];

  // No embedded FK select here — notifications has two valid join paths to
  // profiles (recipient_id and actor_id), and this app's generated
  // Database type doesn't carry Relationships metadata for embeds (every
  // table's Relationships array is `[]`), so batch-fetching actors/titles
  // separately and joining in JS avoids depending on a PostgREST
  // disambiguation hint matching an exact constraint name. Same pattern
  // hot-takes/page.tsx already uses for its sibling ratings lookup.
  const actorIds = [...new Set(notifications.map((n) => n.actor_id).filter((id): id is string => !!id))];
  const titleIds = [...new Set(notifications.map((n) => n.title_id).filter((id): id is string => !!id))];

  const [{ data: actorRows }, { data: titleRows }] = await Promise.all([
    actorIds.length
      ? supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", actorIds)
      : Promise.resolve({ data: [] as { id: string; username: string; display_name: string | null; avatar_url: string | null }[] }),
    titleIds.length
      ? supabase.from("titles").select("id, name").in("id", titleIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const actorById = new Map((actorRows ?? []).map((a) => [a.id, a as ActorInfo]));
  const titleNameById = new Map((titleRows ?? []).map((t) => [t.id, t.name]));

  // Marks everything as read once the viewer has actually loaded this page
  // (mirrors markConversationRead's pattern in messages.ts) — the rows
  // above still reflect their read_at as originally fetched, so the unread
  // highlight remains visible for this render even though the badge in the
  // nav will clear on the next navigation.
  await markAllNotificationsRead();

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
            const actor = n.actor_id ? actorById.get(n.actor_id) : undefined;
            const titleName = n.title_id ? titleNameById.get(n.title_id) ?? null : null;
            const actorName = actor?.display_name || actor?.username || "Someone";
            const message = describe(n.type, actorName, titleName);
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
