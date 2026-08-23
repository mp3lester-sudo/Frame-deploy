import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";

export interface Credit {
  credit_type: string;
  character_name: string | null;
  billing_order: number | null;
  people: { id: string; name: string; photo_url: string | null } | null;
}

export function CreditsSection({ credits }: { credits: Credit[] }) {
  const directors = credits.filter((c) => c.credit_type === "director" && c.people);
  const cast = credits
    .filter((c) => c.credit_type === "actor" && c.people)
    .sort((a, b) => (a.billing_order ?? 0) - (b.billing_order ?? 0));

  if (!directors.length && !cast.length) return null;

  return (
    <div className="mt-6 flex flex-col gap-4">
      {directors.length > 0 && (
        <p className="text-sm">
          <span className="text-foreground-muted">Directed by </span>
          <span className="font-medium">
            {directors.map((d, i) => (
              <span key={d.people!.id}>
                <Link href={`/person/${d.people!.id}`} className="hover:underline">
                  {d.people!.name}
                </Link>
                {i < directors.length - 1 && ", "}
              </span>
            ))}
          </span>
        </p>
      )}

      {cast.length > 0 && (
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-foreground-muted">Cast</p>
          <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-1">
            {cast.map((c, i) => (
              <Link
                href={`/person/${c.people!.id}`}
                key={i}
                className="flex w-20 shrink-0 snap-start flex-col items-center gap-1.5 text-center"
              >
                <Avatar name={c.people!.name} src={c.people!.photo_url} size={56} />
                <p className="line-clamp-2 text-xs leading-tight hover:underline">{c.people!.name}</p>
                {c.character_name && (
                  <p className="line-clamp-1 text-[10px] leading-tight text-foreground-muted">
                    {c.character_name}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
