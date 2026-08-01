import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import type { CastCrewSearchResult } from "@/lib/actions/cast-crew";

export function CastCrewResultCard({ person }: { person: CastCrewSearchResult }) {
  return (
    <Link
      href={`/person/${person.id}`}
      className="flex items-center gap-3 border-b border-border py-3 last:border-0"
    >
      <Avatar name={person.name} src={person.photoUrl} size={40} />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{person.name}</p>
        {person.role && <p className="truncate text-xs text-foreground-muted">{person.role}</p>}
      </div>
    </Link>
  );
}
