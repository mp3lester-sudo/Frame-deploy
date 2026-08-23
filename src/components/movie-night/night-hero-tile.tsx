import Link from "next/link";
import { X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cancelMovieNight } from "@/lib/actions/movie-night";

/**
 * The big "tonight" tile for a still-collecting night -- replaces the
 * old plain bordered row. Bento-card surface with a warm gradient wash
 * (no poster art here on purpose: the candidate pool is still forming,
 * so there's no single image that represents "the pick" yet -- that's
 * what the poster grid below is for, once a night is decided) plus a
 * live vote progress bar so the host can see engagement at a glance
 * without opening the night.
 *
 * The host-only cancel control (top-right X) exists so a night that
 * never gets going -- everyone forgot to vote, plans changed -- doesn't
 * just pile up here forever. Before this, the only way to clear one out
 * was to open it and find the "Cancel" button on the detail page, so
 * abandoned nights just accumulated at the top of the list. It's a
 * sibling of the Link rather than nested inside it (an <a> can't legally
 * contain a <form>), positioned over the tile's corner.
 */
export function NightHeroTile({
  nightId,
  hostLabel,
  participants,
  votedCount,
  isHost,
}: {
  nightId: string;
  hostLabel: string;
  participants: { username: string; display_name: string | null; avatar_url: string | null }[];
  votedCount: number;
  isHost: boolean;
}) {
  const total = Math.max(participants.length, 1);
  const segments = Array.from({ length: total }, (_, i) => i < votedCount);

  return (
    <div className="bento-card relative overflow-hidden transition-transform duration-200 hover:-translate-y-0.5">
      <Link
        href={`/movie-night/${nightId}`}
        className="block p-5"
        style={{
          backgroundImage:
            "linear-gradient(120deg, rgba(217,184,118,0.16) 0%, var(--glass-bg) 55%, var(--glass-bg) 100%)",
        }}
      >
        <p className="text-[10px] uppercase tracking-wider text-accent">Tonight &middot; collecting picks</p>
        <p className="mt-1 pr-8 text-base font-medium">
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

      {isHost && (
        <form action={cancelMovieNight.bind(null, nightId)} className="absolute right-2 top-2 z-10">
          <button
            type="submit"
            title="Cancel this movie night"
            aria-label="Cancel this movie night"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-background/80 text-foreground-muted transition-colors hover:text-danger"
          >
            <X size={14} />
          </button>
        </form>
      )}
    </div>
  );
}
