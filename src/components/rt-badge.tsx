import { cn } from "@/lib/utils";

/**
 * Rotten Tomatoes-style critic score badge. Both states use the app's own
 * tokens at low opacity (border-X/40 bg-X/10 text-X) rather than raw
 * Tailwind color scales -- fresh (score 60%+) goes through --danger, and
 * rotten (below 60%) goes through --success, matching the muted,
 * low-saturation treatment every other accent/danger/success use in the
 * app shares. Raw Tailwind emerald-* previously used for the rotten state
 * read too saturated and cold against the deep wine background, the same
 * way raw red-* did before this component was first tokenized.
 */
export function RtBadge({ score }: { score: number }) {
  const fresh = score >= 60;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[var(--radius-full)] border px-2.5 py-0.5 text-xs font-semibold",
        fresh
          ? "border-danger/40 bg-danger/10 text-danger"
          : "border-success/40 bg-success/10 text-success"
      )}
      title="Rotten Tomatoes critic score"
    >
      <span aria-hidden>{fresh ? "🍅" : "🟢"}</span>
      {score}%
    </span>
  );
}
