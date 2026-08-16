import { cn } from "@/lib/utils";

/**
 * Rotten Tomatoes-style critic score, "stacked stat" treatment -- number on
 * top, a small uppercase "Critics" caption underneath. Replaced the earlier
 * emoji pill (tomato/green-circle in a rounded border) after design review:
 * the pill read as a novelty sticker next to the genre badges it sits beside,
 * where this reads as one more data point (same idea as the runtime/year
 * line above it) instead of a badge competing for attention. No icon at
 * all -- color is doing all the "fresh vs rotten" signaling, same
 * --danger/--success tokens as before (fresh 60%+ through --danger,
 * rotten below 60% through --success -- yes, that pairing looks backwards
 * next to the words, but it's intentional: matches Rotten Tomatoes' own
 * red-tomato-for-Fresh / green-splat-for-Rotten convention, not a literal
 * "red bad, green good" reading).
 */
export function RtBadge({ score }: { score: number }) {
  const fresh = score >= 60;
  return (
    <span
      className={cn("inline-flex flex-col leading-none", fresh ? "text-danger" : "text-success")}
      title="Rotten Tomatoes critic score"
    >
      <span className="font-section-heading text-[15px] font-extrabold leading-none">{score}%</span>
      <span className="mt-0.5 text-[8.5px] font-medium uppercase tracking-[0.14em] text-foreground-muted">
        Critics
      </span>
    </span>
  );
}
