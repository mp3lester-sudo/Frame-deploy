import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";

export function MovieNightCard({
  nightId,
  participants,
  isHost,
}: {
  nightId: string;
  participants: { username: string; display_name: string | null; avatar_url: string | null }[];
  isHost: boolean;
}) {
  return (
    <div>
      <h3 className="font-display mb-3 text-lg">Movie night</h3>
      <Link
        href={`/movie-night/${nightId}`}
        className="bento-card flex items-center gap-4 p-4"
      >
        <div className="flex -space-x-2">
          {participants.slice(0, 4).map((p) => (
            <Avatar
              key={p.username}
              name={p.display_name ?? p.username}
              src={p.avatar_url}
              size={36}
              className="border-2 border-surface"
            />
          ))}
        </div>
        <div className="flex-1">
          <p className="text-sm">
            {isHost ? "You're hosting" : "You're invited"} &middot; {participants.length}{" "}
            {participants.length === 1 ? "person" : "people"}
          </p>
          <p className="text-[11px] uppercase tracking-wider text-accent">Collecting picks</p>
        </div>
      </Link>
    </div>
  );
}
