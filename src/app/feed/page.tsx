import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { Avatar } from "@/components/ui/avatar";
import { formatDistanceToNow } from "@/lib/date";

const EVENT_COPY: Record<string, (name: string, target: string) => string> = {
  rated: (name, target) => `${name} rated ${target}`,
  reviewed: (name, target) => `${name} reviewed ${target}`,
  watched: (name, target) => `${name} watched ${target}`,
  list_created: (name) => `${name} created a new list`,
  followed: (name) => `${name} followed someone new`,
};

export default async function FeedPage() {
  const supabase = await createClient();
  const user = await getVerifiedUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center text-sm text-foreground-muted">
        <Link href="/login" className="text-accent hover:underline">
          Log in
        </Link>{" "}
        to see what people you follow are watching.
      </div>
    );
  }

  const { data: following } = await supabase.from("follows").select("followee_id").eq("follower_id", user.id);
  const followeeIds = (following ?? []).map((f) => f.followee_id);

  const { data: events } = await supabase
    .from("activity_events")
    .select("*, profiles(username, avatar_url), titles(name)")
    .in("user_id", followeeIds.length ? followeeIds : ["00000000-0000-0000-0000-000000000000"])
    .order("created_at", { ascending: false })
    .limit(30);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl">Feed</h1>
        <Link href="/hot-takes" className="text-xs uppercase tracking-wider text-foreground-muted hover:text-accent">
          Hot Takes &rarr;
        </Link>
      </div>

      {!events?.length && (
        <p className="text-sm text-foreground-muted">
          Nothing yet — follow a few people to see their activity here.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {events?.map((e) => {
          const profile = (e as unknown as { profiles: { username: string; avatar_url: string | null } }).profiles;
          const titleName = (e as unknown as { titles: { name: string } | null }).titles?.name ?? "a title";
          const copy = EVENT_COPY[e.event_type]?.(profile?.username ?? "Someone", titleName) ?? "New activity";

          return (
            <div key={e.id} className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border p-3">
              <Avatar name={profile?.username ?? "?"} src={profile?.avatar_url} size={32} />
              <div className="flex-1">
                <p className="text-sm">{copy}</p>
                <p className="text-xs text-foreground-muted">{formatDistanceToNow(e.created_at)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
