import Image from "@/components/ui/fade-image";
import Link from "next/link";
import type { ContinueWatchingItem } from "@/lib/watch-sessions/actions";
import { computeElapsedSeconds, computeProgressPercent, formatRemaining } from "@/lib/watch-sessions/progress";

/**
 * Home page "Continue watching" (rendition D) -- a single quiet row for
 * the viewer's own most recently active solo session, matching the
 * approved mockup (d.png): poster thumb, title + "RESUME" on one line,
 * a full-width progress bar, "X min left · status" below it. Server
 * component with a static elapsed snapshot at render time -- unlike
 * PressPlayButton (which ticks live while playing, see use-live-elapsed
 * .ts), this is a link back into the real Press Play control on the
 * movie page, not a player itself, so a snapshot from the moment the
 * page rendered is honest enough; it doesn't claim to track live.
 */
export function ContinueWatchingRow({ item }: { item: ContinueWatchingItem }) {
  const { title } = item;
  const { progressPercent, remaining, statusLabel } = resolveDisplay(item);

  return (
    <Link href={`/movie/${title.id}`} className="flex items-center gap-3 py-1">
      <div className="relative aspect-[2/3] w-14 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-surface-raised">
        {title.poster_url && (
          <Image src={title.poster_url} alt={title.name} fill className="object-cover" sizes="56px" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{title.name}</p>
          <span className="text-gold-foil shrink-0 text-[11px] font-bold uppercase tracking-[0.12em]">Resume</span>
        </div>
        {progressPercent != null && (
          <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-white/10">
            <div className="bg-gold-foil h-full rounded-full" style={{ width: `${progressPercent}%` }} />
          </div>
        )}
        <p className="mt-1.5 truncate text-[11px] text-foreground-muted">
          {remaining ? `${remaining} · ${statusLabel}` : statusLabel === "paused" ? "Paused" : "In progress"}
        </p>
      </div>
    </Link>
  );
}

// Plain (non-component) helper -- keeps the one impure Date.now() read
// out of the component's render body, same pattern press-play-button.tsx
// uses for its own "completed N days ago" note.
function resolveDisplay(item: ContinueWatchingItem) {
  const { session, title } = item;
  const elapsed = computeElapsedSeconds(
    { status: session.status, accumulatedSeconds: session.accumulated_seconds, startedAt: session.started_at },
    Date.now()
  );
  return {
    progressPercent: computeProgressPercent(elapsed, title.runtime_minutes),
    remaining: formatRemaining(elapsed, title.runtime_minutes),
    statusLabel: session.status === "paused" ? "paused" : "playing",
  };
}
