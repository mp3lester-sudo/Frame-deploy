import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { Avatar } from "@/components/ui/avatar";
import { markAllNotificationsRead } from "@/lib/actions/notifications";
import { formatDistanceToNow } from "@/lib/date";
import type { Database } from "@/lib/supabase/types";
import { getActiveMediaType } from "@/lib/context/media-type";
import { movieNightLabel, movieNightLabelLower } from "@/lib/copy/movie-night-copy";

type NotificationType = Database["public"]["Tables"]["notifications"]["Row"]["type"];
type ActorInfo = { username: string; display_name: string | null; avatar_url: string | null };

/** The message shown for each notification type. */
function describe(
  type: NotificationType,
  actorName: string,
  titleName: string | null,
  mediaType: "movie" | "tv"
): string {
  switch (type) {
    case "follow":
      return `${actorName} started following you.`;
    case "comment":
      return `${actorName} commented on your review${titleName ? ` of ${titleName}` : ""}.`;
    case "reaction":
      return `${actorName} reacted to your review${titleName ? ` of ${titleName}` : ""}.`;
    case "movie_night_invite":
      return `${actorName} invited you to a ${movieNightLabelLower(mediaType)}.`;
    case "movie_night_decided":
      return `${movieNightLabel(mediaType)} picked ${titleName ?? "a title"}.`;
    case "payment_failed":
      return "We couldn't process your Premium payment — update your card to keep your subscription.";
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
    case "payment_failed":
      return "/premium";
  }
}

export default async function NotificationsPage() {
  const supabase = await createClient();
  const viewer = await getVerifiedUser();
  if (!viewer) redirect("/login?next=/notifications");
  const activeMediaType = await getActiveMediaType();

  const { data: rows } = await supabase
    .from("notifications")
    .select("id, type, actor_id, title_id, ref_id, read_at, created_at")
    .eq("recipient_id", viewer.id)
    .order("created_at", { ascending: false })
    .limit(50);

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

  // markAllNotificationsRead only depends on viewer.id (already resolved
  // above), not on the actor/title lookups below, so it runs alongside
  // them instead of waiting its turn after -- it still runs strictly
  // after the `rows` fetch above, which is what actually matters: marks
  // everything as read once the viewer has loaded this page (mirrors
  // markConversationRead's pattern in messages.ts), while `rows` still
  // reflects each notification's read_at as originally fetched, so the
  // unread highlight remains visible for this render even though the
  // badge in the nav will clear on the next navigation.
  const [{ data: actorRows }, { data: titleRows }] = await Promise.all([
    actorIds.length
      ? supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", actorIds)
      : Promise.resolve({ data: [] as { id: string; username: string; display_name: string | null; avatar_url: string | null }[] }),
    titleIds.length
      ? supabase.from("titles").select("id, name, type").in("id", titleIds)
      : Promise.resolve({ data: [] as { id: string; name: string; type: string }[] }),
    markAllNotificationsRead(),
  ]);

  const actorById = new Map((actorRows ?? []).map((a) => [a.id, a as ActorInfo]));
  const titleNameById = new Map((titleRows ?? []).map((t) => [t.id, t.name]));
  const titleTypeById = new Map((titleRows ?? []).map((t) => [t.id, t.type]));

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-display mb-6 text-2xl">Notifications</h1>

      {notifications.length === 0 ? (
        <p className="text-sm text-foreground-muted">
          Nothing yet. Follows, comments, reactions, and {movieNightLabel(activeMediaType)} invites will show up here.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notifications.map((n) => {
            const actor = n.actor_id ? actorById.get(n.actor_id) : undefined;
            const titleName = n.title_id ? titleNameById.get(n.title_id) ?? null : null;
            const actorName = actor?.display_name || actor?.username || "Someone";
            const notificationMediaType =
              n.title_id && titleTypeById.get(n.title_id) === "tv" ? "tv" : activeMediaType;
            const message = describe(n.type, actorName, titleName, notificationMediaType);
            const href = linkFor(n.type, actor?.username ?? null, n.title_id, n.ref_id);
            const unread = !n.read_at;

            return (
              <li key={n.id}>
                <Link
                  href={href}
                  className={`bento-card flex items-center gap-3 p-3 ${unread ? "border-accent/30" : ""}`}
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
