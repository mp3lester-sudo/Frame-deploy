import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { formatDistanceToNow } from "@/lib/date";

const EVENT_COPY: Record<string, (name: string, target: string) => string> = {
  rated: (name, target) => `${name} rated ${target}`,
  reviewed: (name, target) => `${name} reviewed ${target}`,
  watched: (name, target) => `${name} watched ${target}`,
  list_created: (name) => `${name} created a new list`,
  followed: (name) => `${name} followed someone new`,
};

export type CircleEvent = {
  id: string;
  event_type: string;
  created_at: string;
  profiles: { username: string; avatar_url: string | null } | null;
  titles: { name: string } | null;
};

export function CircleFeed({ items }: { items: CircleEvent[] }) {
  if (!items.length) return null;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-lg">From your circle</h3>
        <Link href="/feed" className="text-[11px] uppercase tracking-wider text-foreground-muted hover:text-accent">
          See all
        </Link>
      </div>
      <div className="flex flex-col gap-3">
        {items.map((item) => {
          const name = item.profiles?.username ?? "Someone";
          const copy = EVENT_COPY[item.event_type]?.(name, item.titles?.name ?? "a title") ?? "New activity";
          const username = item.profiles?.username;
          return (
            <Card key={item.id} className="flex items-center gap-3">
              {username ? (
                <Link href={`/profile/${username}`} className="shrink-0 hover:opacity-80">
                  <Avatar name={name} src={item.profiles?.avatar_url} size={36} />
                </Link>
              ) : (
                <Avatar name={name} src={item.profiles?.avatar_url} size={36} />
              )}
              <div className="flex-1">
                <p className="text-sm">{copy}</p>
                <p className="text-[11px] text-foreground-muted">{formatDistanceToNow(item.created_at)}</p>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
