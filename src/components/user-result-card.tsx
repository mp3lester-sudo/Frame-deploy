import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { FollowButton } from "@/components/follow-button";
import type { UserSearchResult } from "@/lib/actions/users";

export function UserResultCard({ user }: { user: UserSearchResult }) {
  return (
    <div className="flex items-center gap-3 border-b border-border py-3 last:border-0">
      <Link href={`/profile/${user.username}`} className="flex flex-1 items-center gap-3 min-w-0">
        <Avatar name={user.display_name ?? user.username} src={user.avatar_url} size={40} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{user.display_name ?? user.username}</p>
          <p className="truncate text-xs text-foreground-muted">@{user.username}</p>
        </div>
      </Link>
      <FollowButton userId={user.id} initiallyFollowing={user.isFollowing} />
    </div>
  );
}
