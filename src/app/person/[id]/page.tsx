import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrFetchPersonBio } from "@/lib/external/tmdb-person";
import { tmdbImageAtSize } from "@/lib/external/tmdb-client";
import { PersonPortrait } from "@/components/person-portrait";

function formatBirthday(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function PersonProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: person } = await supabase.from("people").select("*").eq("id", id).single();
  if (!person) notFound();

  const { bio, birthday, placeOfBirth } = await getOrFetchPersonBio(person);

  const { data: credits } = await supabase
    .from("title_credits")
    .select("credit_type, character_name, titles(id, name, poster_url, release_date, type)")
    .eq("person_id", id);

  type FilmographyRow = {
    credit_type: string;
    character_name: string | null;
    titles: { id: string; name: string; poster_url: string | null; release_date: string | null; type: string } | null;
  };

  const filmography = ((credits ?? []) as unknown as FilmographyRow[])
    .filter((c) => c.titles)
    .sort((a, b) => (b.titles!.release_date ?? "").localeCompare(a.titles!.release_date ?? ""));

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <PersonPortrait
          src={tmdbImageAtSize(person.photo_url, "h632")}
          name={person.name}
          className="w-40 shrink-0 sm:w-56"
        />

        <div className="flex-1">
          <h1 className="text-2xl font-semibold sm:text-3xl">{person.name}</h1>
          {(birthday || placeOfBirth) && (
            <p className="mt-1 text-sm text-foreground-muted">
              {formatBirthday(birthday)}
              {birthday && placeOfBirth && " · "}
              {placeOfBirth}
            </p>
          )}
          {bio ? (
            <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-foreground-muted">{bio}</p>
          ) : (
            <p className="mt-4 text-sm text-foreground-muted">No biography available yet.</p>
          )}
        </div>
      </div>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">
          Filmography <span className="text-sm font-normal text-foreground-muted">({filmography.length})</span>
        </h2>
        {filmography.length ? (
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5">
            {filmography.map((c, i) => (
              <Link href={`/movie/${c.titles!.id}`} key={i} className="group">
                <div className="relative aspect-[2/3] overflow-hidden rounded-[var(--radius-md)] bg-surface-raised">
                  {c.titles!.poster_url && (
                    <Image
                      src={c.titles!.poster_url}
                      alt={c.titles!.name}
                      fill
                      className="object-cover transition group-hover:opacity-80"
                    />
                  )}
                </div>
                <p className="mt-1.5 line-clamp-2 text-xs leading-tight group-hover:underline">{c.titles!.name}</p>
                <p className="line-clamp-1 text-[10px] leading-tight text-foreground-muted">
                  {c.titles!.release_date?.slice(0, 4)}
                  {c.character_name ? ` · ${c.character_name}` : c.credit_type === "director" ? " · Director" : ""}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-foreground-muted">No credited titles yet.</p>
        )}
      </section>
    </div>
  );
}
