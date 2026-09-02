import { computeProgressPercent, formatClock, formatRemaining } from "@/lib/watch-sessions/progress";
import { cn } from "@/lib/utils";

/**
 * Purely presentational -- the live-ticking `elapsedSeconds` number comes
 * from useLiveElapsed in the caller, this just renders it. No runtime
 * means no bar at all (nothing honest to show a percentage of), just the
 * running clock.
 */
export function WatchProgressBar({
  elapsedSeconds,
  runtimeMinutes,
  className,
}: {
  elapsedSeconds: number;
  runtimeMinutes: number | null;
  className?: string;
}) {
  const percent = computeProgressPercent(elapsedSeconds, runtimeMinutes);
  const remaining = formatRemaining(elapsedSeconds, runtimeMinutes);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {percent !== null && (
        <div className="h-1.5 w-full overflow-hidden rounded-[var(--radius-full)] bg-surface-raised">
          <div
            className="h-full rounded-[var(--radius-full)] bg-gold-foil transition-[width] duration-1000 ease-linear"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
      <div className="flex items-center justify-between text-xs text-foreground-muted">
        <span className="tabular-nums">{formatClock(elapsedSeconds)}</span>
        {remaining && <span>{remaining}</span>}
      </div>
    </div>
  );
}
