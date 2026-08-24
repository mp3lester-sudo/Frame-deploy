import Image from "@/components/ui/fade-image";
import Link from "next/link";
import type { TasteTwinResult } from "@/lib/social/taste-twin";

/**
 * Only ever rendered when getTasteTwin() returned a real match -- both
 * privacy gates (viewer opted in, twin opted in, mutual follows, >=85%
 * with enough shared ratings) already happened server-side before this
 * component sees any data. See src/lib/social/taste-twin.ts.
 */
export function TasteTwinCard({ twin }: { twin: TasteTwinResult }) {
  return (
    <Link
      href={`/profile/${twin.twinUsername}`}
      className="bento-card mt-8 flex items-center gap-4 p-4 transition-colors hover:border-accent/40"
    >
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border border-border-strong bg-surface-raised">
        {twin.twinAvatarUrl && <Image src={twin.twinAvatarUrl} alt="" fill className="object-cover" sizes="56px" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wider text-accent">Your taste twin</p>
        <p className="mt-1 text-sm text-foreground">
          You and <span className="font-medium">{twin.twinName}</span> agree {twin.percent}% of the time — more
          than anyone else you follow.
        </p>
        {twin.sharedFavoriteGenres.length > 0 && (
          <p className="mt-1 truncate text-xs text-foreground-muted">
            Both of you gravitate toward {twin.sharedFavoriteGenres.slice(0, 2).join(" and ")}
          </p>
        )}
      </div>
    </Link>
  );
}
