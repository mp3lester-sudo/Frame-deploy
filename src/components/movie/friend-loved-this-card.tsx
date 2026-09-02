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
    <Link href={`/profile/${friend.username}`} className="flex items-center gap-3 py-3">
      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border-strong bg-surface-raised">
        {friend.avatarUrl && <Image src={friend.avatarUrl} alt="" fill className="object-cover" sizes="36px" />}
      </div>
      <p className="min-w-0 flex-1 truncate text-sm italic text-foreground-muted">
        <span className="font-semibold not-italic text-foreground">{friend.name}</span> also loved this
        {friend.reviewExcerpt && <> &mdash; &ldquo;{friend.reviewExcerpt}&rdquo;</>}
      </p>
    </Link>
  );
}
