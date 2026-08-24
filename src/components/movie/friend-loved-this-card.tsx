import Image from "@/components/ui/fade-image";
import Link from "next/link";
import type { FriendLovedThisResult } from "@/lib/social/friend-loved-this";

/**
 * "X loved this too" -- only rendered when a followed friend rated this
 * title >=4 (see getFriendLovedThis). No opt-in gate: following someone
 * is the consent to see their ratings/reviews next to titles, same as the
 * public profile and reviews pages already show unconditionally.
 */
export function FriendLovedThisCard({ friend }: { friend: FriendLovedThisResult }) {
  return (
    <Link
      href={`/profile/${friend.username}`}
      className="bento-card flex items-center gap-3 p-3 transition-colors hover:border-accent/40"
    >
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border-strong bg-surface-raised">
        {friend.avatarUrl && <Image src={friend.avatarUrl} alt="" fill className="object-cover" sizes="40px" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground">
          <span className="font-medium">{friend.name}</span> rated this {friend.score}/5
        </p>
        {friend.reviewExcerpt && (
          <p className="mt-0.5 truncate text-xs italic text-foreground-muted">&ldquo;{friend.reviewExcerpt}&rdquo;</p>
        )}
      </div>
    </Link>
  );
}
