import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";

/**
 * The big "tonight" tile for a still-collecting night -- replaces the
 * old plain bordered row. Bento-card surface with a warm gradient wash
 * (no poster art here on purpose: the candidate pool is still forming,
 * so there's no single image that represents "the pick" yet -- that's
 * what the poster grid below is for, once a night is decided) plus a
 * live vote progress bar so the host can see engagement at a glance
 * without opening the night.
 */
export function NightHeroTile({
  nightId,
  hostLabel,
  participants,
  votedCount,
}: {
  nightId: string;
  hostLabel: string;
  participants: { username: string; display_name: string | null; avatar_url: string | null }[];
  votedCount: number;
}) {
  const total = Math.max(participants.length, 1);
  const segments = Array.from({ length: total }, (_, i) => i < votedCount);

  return (
    <Link
      href={`/movie-night/${nightId}`}
      className="bento-card relative block overflow-hidden p-5"
      style={{
        backgroundImage:
          "linear-gradient(120deg, rgba(217,184,118,0.16) 0%, var(--glass-bg) 55%, var(--glass-bg) 100%)",
      }}
    >
      <p className="text-[10px] uppercase tracking-wider text-accent">Tonight &middot; collecting picks</p>
      <p className="mt-1 text-base font-medium">
        {hostLabel} &middot; {participants.length} {participants.length === 1 ? "person" : "people"}
      </p>

      <div className="mt-4 flex -space-x-2">
        {participants.slice(0, 6).map((p) => (
          <Avatar
            key={p.username}
            name={p.display_name ?? p.username}
            src={p.avatar_url}
            size={28}
            className="border-2 border-surface"
          />
        ))}
      </div>

      <div className="mt-4 flex gap-1.5">
        {segments.map((voted, i) => (
          <div
            key={i}
            className="h-[3px] flex-1 rounded-full"
            style={{ backgroundColor: voted ? "var(--accent)" : "rgba(217,184,118,0.25)" }}
          />
        ))}
      </div>
      <p className="mt-2 text-[11px] text-foreground-muted">
        {votedCount} of {participants.length} {participants.length === 1 ? "person has" : "have"} voted
      </p>
    </Link>
  );
}
