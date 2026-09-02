import { Suspense } from "react";
import Image from "@/components/ui/fade-image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getOrFetchPersonBio,
  getTmdbPersonImages,
  getTmdbTaggedImages,
  type PersonBioLookupInput,
  type TmdbTaggedImage,
} from "@/lib/external/tmdb-person";
import { tmdbImageAtSize } from "@/lib/external/tmdb-client";
import { PersonHero } from "@/components/person-hero";
import { PersonStillsGallery } from "@/components/person-stills-gallery";
import { PersonIconicRoles, type IconicRole } from "@/components/person-iconic-roles";
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
 * Everything on this page that depends on a live TMDB call (bio, extra
 * stills, tagged/iconic-role images) -- isolated behind its own Suspense
 * boundary so the page shell (photo, name, filmography, collaborators --
 * all DB-only) paints immediately instead of blocking on three unbounded
 * external fetches. This was the exact same class of bug just fixed on
 * the movie page (see MovieDetailPage's RtScoreBadge/WatchProvidersSection/
 * etc.): a top-level `await Promise.all([...three TMDB calls...])` held up
 * the whole page render, and (before fetch-timeout.ts) had no bound on how
 * long a slow/hanging TMDB response could take.
 *
 * All three calls now carry EXTERNAL_FETCH_TIMEOUT_MS (2.5s) via
 * tmdb-person.ts, so this boundary's worst case is bounded rather than
 * open-ended.
 */
async function PersonEnrichment({ person, filmography }: { person: PersonBioLookupInput & { photo_url: string | null; name: string }; filmography: FilmographyRow[] }) {
  const [{ bio, birthday, placeOfBirth }, stillImages, taggedImages] = await Promise.all([
    getOrFetchPersonBio(person),
    person.tmdb_id ? getTmdbPersonImages(person.tmdb_id) : Promise.resolve([] as string[]),
    person.tmdb_id ? getTmdbTaggedImages(person.tmdb_id) : Promise.resolve([] as TmdbTaggedImage[]),
  ]);

  // "Iconic roles": a real photo of THIS person from a specific
  // production (TMDB tagged_images — see getTmdbTaggedImages), not that
  // title's poster and not a generic headshot. Matched back to our own
  // acting credits by TMDB id so the caption can be the actual character
  // name, and deduped to the single best-voted image per title. Ranked
  // by the title's own popularity (already backfilled across the
  // catalogue — see Task #32) so a small early-career cameo doesn't
  // outrank the role someone actually knows this person for.
  const actingCreditsByTmdbId = new Map(
    filmography
      .filter((c) => c.credit_type === "actor" && c.character_name && c.titles?.tmdb_id != null)
      .map((c) => [c.titles!.tmdb_id as number, c])
  );

  const bestImageByTitle = new Map<number, (typeof taggedImages)[number]>();
  for (const img of taggedImages) {
    if (!actingCreditsByTmdbId.has(img.tmdbTitleId)) continue;
    const existing = bestImageByTitle.get(img.tmdbTitleId);
    if (!existing || img.voteAverage > existing.voteAverage) bestImageByTitle.set(img.tmdbTitleId, img);
  }

  const iconicRoles: IconicRole[] = [...bestImageByTitle.entries()]
    .map(([tmdbTitleId, img]) => {
      const credit = actingCreditsByTmdbId.get(tmdbTitleId)!;
      return {
        titleId: credit.titles!.id,
        titleName: credit.titles!.name,
        imageUrl: img.imageUrl,
        characterName: credit.character_name!,
        popularity: credit.titles!.popularity ?? 0,
      };
    })
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, 8)
    .map(({ titleId, titleName, imageUrl, characterName }) => ({ titleId, titleName, imageUrl, characterName }));

  return (
    <>
      <PersonHero
        photoSrc={tmdbImageAtSize(person.photo_url, "h632")}
        name={person.name}
        birthdayLabel={formatBirthday(birthday)}
        placeOfBirth={placeOfBirth}
        bio={bio}
      />

      {iconicRoles.length >= 2 ? (
        <PersonIconicRoles roles={iconicRoles} />
      ) : (
        <PersonStillsGallery images={stillImages} />
      )}
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
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Suspense
        fallback={
          <PersonHero
            photoSrc={tmdbImageAtSize(person.photo_url, "h632")}
            name={person.name}
            birthdayLabel={null}
            placeOfBirth={null}
            bio={null}
            bioLoading
          />
        }
      >
        <PersonEnrichment person={person} filmography={filmography} />
      </Suspense>

      <FrequentCollaborators collaborators={frequentCollaborators} />

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">
          Filmography <span className="text-sm font-normal text-foreground-muted">({filmography.length})</span>
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
  );
}
