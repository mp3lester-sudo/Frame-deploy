import { cn } from "@/lib/utils";

/** Rotten Tomatoes-style critic score badge. Fresh (green) at 60%+, rotten (red) below. */
export function RtBadge({ score }: { score: number }) {
  const fresh = score >= 60;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[var(--radius-full)] border px-2.5 py-0.5 text-xs font-semibold",
        fresh
          ? "border-red-900/30 bg-red-950/20 text-red-400/70"
          : "border-emerald-800/40 bg-emerald-950/30 text-emerald-500"
      )}
      title="Rotten Tomatoes critic score"
    >
      <span aria-hidden>{fresh ? "🍅" : "🟢"}</span>
      {score}%
    </span>
  );
}
