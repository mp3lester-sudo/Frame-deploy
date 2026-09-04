import { Suspense } from "react";
import Image from "@/components/ui/fade-image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getOrFetchPersonBio,
  type PersonBioLookupInput,
} from "@/lib/external/tmdb-person";
import { tmdbImageAtSize } from "@/lib/external/tmdb-client";
import { PersonHero } from "@/components/person-hero";
import { PersonBio } from "@/components/person-bio";
import { FrequentCollaborators } from "@/components/frequent-collaborators";
import { computeFrequentCollaborators, type CollaboratorCredit } from "@/lib/people/collaborators";

function formatBirthday(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

type FilmographyRow = {
  credit_type: string;
  character_name: string | null;
  titles: {
    id: string;
    name: string;
    poster_url: string | null;
    release_date: string | null;
    type: string;
    popularity: number | null;
    tmdb_id: number | null;
  } | null;
};

/**
 * Bio/birthday/place-of-birth depend on a live TMDB call, so this stays
 * behind its own Suspense boundary -- the page shell (photo, name,
 * filmography, collaborators, all DB-only) paints immediately instead of
 * blocking on it. See getOrFetchPersonBio in tmdb-person.ts for the
 * write-through cache and EXTERNAL_FETCH_TIMEOUT_MS (2.5s) bound.
 *
 * Used to also fetch and render a gallery of extra stills/"iconic role"
 * photos below the bio (two more unbounded TMDB calls) -- removed per
 * product direction: the full-bleed hero photo is the one image that
 * matters on this page, and a second wall of photos below it competed
 * with the Filmography grid rather than adding anything.
 */
async function PersonEnrichment({ person }: { person: PersonBioLookupInput & { photo_url: string | null; name: string } }) {
  const { bio, birthday, placeOfBirth } = await getOrFetchPersonBio(person);
  const birthdayLabel = formatBirthday(birthday);

  return (
    <>
      {(birthdayLabel || placeOfBirth) && (
        <p className="mb-3 text-sm text-foreground-muted">
          {birthdayLabel}
          {birthdayLabel && placeOfBirth && " · "}
          {placeOfBirth}
        </p>
      )}
      <PersonBio bio={bio} />
    </>
  );
}

export default async function PersonProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: person } = await supabase.from("people").select("*").eq("id", id).single();
  if (!person) notFound();

  const { data: credits } = await supabase
    .from("title_credits")
    .select("credit_type, character_name, titles(id, name, poster_url, release_date, type, popularity, tmdb_id)")
    .eq("person_id", id);

  const filmography = ((credits ?? []) as unknown as FilmographyRow[])
    .filter((c) => c.titles)
    .sort((a, b) => (b.titles!.release_date ?? "").localeCompare(a.titles!.release_date ?? ""));

  // Real, derived from the same filmography query above -- not a guessed
  // "years active" figure. Earliest release year across every credited
  // title, if any have one. Powers the hero's stat pills (see
  // person-hero.tsx) alongside the plain filmography count.
  const creditYears = filmography
    .map((c) => c.titles!.release_date?.slice(0, 4))
    .filter((y): y is string => Boolean(y))
    .map(Number);
  const activeSince = creditYears.length ? Math.min(...creditYears) : null;

  // Frequently works with (discovery-depth-audit rendition #3) -- every
  // other credit row on any title this person worked on, joined back to
  // the collaborator's own name/photo. Depends on filmography (needs the
  // title ids), so it can't join the earlier query -- kept as its
  // own targeted query rather than over-fetching title_credits for the
  // whole catalogue.
  const filmographyTitleIds = [...new Set(filmography.map((c) => c.titles!.id))];
  const { data: coCredits } = filmographyTitleIds.length
    ? await supabase
        .from("title_credits")
        .select("title_id, person_id, people(id, name, photo_url)")
        .in("title_id", filmographyTitleIds)
    : { data: [] as never[] };

  type CoCreditRow = {
    title_id: string;
    person_id: string;
    people: { id: string; name: string; photo_url: string | null } | null;
  };

  const collaboratorCredits: CollaboratorCredit[] = ((coCredits ?? []) as unknown as CoCreditRow[])
    .filter((c) => c.people)
    .map((c) => ({
      titleId: c.title_id,
      personId: c.person_id,
      personName: c.people!.name,
      photoUrl: c.people!.photo_url,
    }));

  const frequentCollaborators = computeFrequentCollaborators(collaboratorCredits, id);

  return (
    <div>
      {/* Full-bleed, outside the max-w-4xl content wrapper below -- same
          pattern as BackdropHero on the movie page. Pure DB data (photo,
          name, filmography count/years), so it renders on the very first
          paint instead of waiting on the TMDB bio/birthday lookup below
          (see PersonEnrichment's own birthday/place line). */}
      <PersonHero
        photoSrc={tmdbImageAtSize(person.photo_url, "h632")}
        name={person.name}
        titleCount={filmography.length}
        activeSince={activeSince}
      />

      <div className="mx-auto max-w-4xl px-4 pb-8 pt-6">
        <Suspense fallback={<PersonBio bio={null} bioLoading />}>
          <PersonEnrichment person={person} />
        </Suspense>

        <FrequentCollaborators collaborators={frequentCollaborators} />

        <section className="mt-10 border-t border-border pt-8">
          <h2 className="mb-3 font-display text-lg italic text-accent">
            Filmography <span className="font-sans text-sm not-italic text-foreground-muted">({filmography.length})</span>
          </h2>
        {filmography.length ? (
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5">
            {filmography.map((c, i) => (
              <Link
                href={`/movie/${c.titles!.id}`}
                key={i}
                className="stagger-card group transition-transform duration-200 hover:-translate-y-1"
                style={{ animationDelay: `${(i % 12) * 40}ms` }}
              >
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
    </div>
  );
}
