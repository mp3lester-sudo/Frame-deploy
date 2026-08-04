import { cn } from "@/lib/utils";

/**
 * Rotten Tomatoes-style critic score badge. Fresh (score 60%+) uses the
 * app's own --danger token at low opacity (border-danger/40 bg-danger/10
 * text-danger) rather than raw Tailwind red-* -- the stock red read too
 * saturated and cold against the deep wine background, out of step with
 * every other accent/danger use in the app, which all go through this
 * same muted token. Rotten (below 60%) is unchanged.
 */
export function RtBadge({ score }: { score: number }) {
  const fresh = score >= 60;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[var(--radius-full)] border px-2.5 py-0.5 text-xs font-semibold",
        fresh
          ? "border-danger/40 bg-danger/10 text-danger"
          : "border-emerald-800/40 bg-emerald-950/30 text-emerald-500"
      )}
      title="Rotten Tomatoes critic score"
    >
      <span aria-hidden>{fresh ? "🍅" : "🟢"}</span>
      {score}%
    </span>
  );
}
