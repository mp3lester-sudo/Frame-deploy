import { createClient } from "@/lib/supabase/server";
import { getOrFetchPersonBio } from "@/lib/external/tmdb-person";
import { rankFavoriteDirectors, pickDirectorOfDay } from "./pick";

// How many of a user's top-ranked directors are in play for the daily
// rotation. Kept fairly small and deliberately -- this is meant to
// rotate through directors this person has clearly responded well to,
// not their entire rated history down to a single 3.5-star outlier.
const SHORTLIST_SIZE = 8;

// How many of the director's films to show, most popular first. This
// is meant to read as "their discography," not just a to-watch queue --
// so it includes films the user has already rated (that's expected for
// a director they clearly love) and is sized for a horizontal-scroll
// rail rather than a handful of inline tiles.
const FILMOGRAPHY_LIMIT = 10;

export interface DirectorOfTheDay {
  id: string;
  name: string;
  photoUrl: string | null;
  bio: string | null;
  titles: {
    id: string;
    name: string;
    posterUrl: string | null;
  }[];
}

/**
 * Picks today's director for this user (see pick.ts for the ranking +
 * rotation logic) and fetches everything the home page card needs to
 * show them: photo/bio (same lazy TMDB fetch-on-view pattern as the
 * person profile page) and their most popular films overall, so the
 * card reads as a discography rail rather than a narrow to-watch queue.
 * Returns null when there isn't enough rating history to have a real
 * favorite-directors signal yet (same "don't fake it" approach as the
 * rest of the home page's personalization).
 */
export async function getDirectorOfTheDay(userId: string): Promise<DirectorOfTheDay | null> {
  const supabase = await createClient();

  const { data: ratings } = await supabase.from("ratings").select("title_id, score").eq("user_id", userId);
  if (!ratings?.length) return null;

  const titleIds = ratings.map((r) => r.title_id);

  const { data: directorCredits } = await supabase
    .from("title_credits")
    .select("title_id, people(id, name, photo_url, tmdb_id, bio, birthday, place_of_birth, bio_checked_at)")
    .eq("credit_type", "director")
    .in("title_id", titleIds);

  type DirectorRow = {
    id: string;
    name: string;
    photo_url: string | null;
    tmdb_id: number | null;
    bio: string | null;
    birthday: string | null;
    place_of_birth: string | null;
    bio_checked_at: string | null;
  };

  const directorByTitle = new Map<string, { id: string; name: string }>();
  const directorRowById = new Map<string, DirectorRow>();
  for (const c of directorCredits ?? []) {
    const person = (c as unknown as { people: DirectorRow | null }).people;
    if (!person) continue;
    directorByTitle.set(c.title_id, { id: person.id, name: person.name });
    directorRowById.set(person.id, person);
  }

  const ranked = rankFavoriteDirectors(
    ratings.map((r) => ({ titleId: r.title_id, score: Number(r.score) })),
    directorByTitle
  );
  const shortlist = ranked.slice(0, SHORTLIST_SIZE);
  if (!shortlist.length) return null;

  // UTC calendar day -- simple and consistent; the point is "changes once
  // a day," not precise midnight-in-your-timezone rollover.
  const dateKey = new Date().toISOString().slice(0, 10);
  const pick = pickDirectorOfDay(shortlist, userId, dateKey);
  if (!pick) return null;

  const directorRow = directorRowById.get(pick.id);

  const [bioResult, titlesResult] = await Promise.all([
    directorRow
      ? getOrFetchPersonBio({
          id: directorRow.id,
          tmdb_id: directorRow.tmdb_id,
          bio: directorRow.bio,
          birthday: directorRow.birthday,
          place_of_birth: directorRow.place_of_birth,
          bio_checked_at: directorRow.bio_checked_at,
        })
      : Promise.resolve({ bio: null, birthday: null, placeOfBirth: null }),
    supabase
      .from("title_credits")
      .select("titles(id, name, poster_url, popularity)")
      .eq("person_id", pick.id)
      .eq("credit_type", "director"),
  ]);

  type FilmRow = { id: string; name: string; poster_url: string | null; popularity: number | null };
  const films = ((titlesResult.data ?? []) as unknown as { titles: FilmRow | null }[])
    .map((r) => r.titles)
    .filter((t): t is FilmRow => !!t)
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .slice(0, FILMOGRAPHY_LIMIT);

  return {
    id: pick.id,
    name: pick.name,
    photoUrl: directorRow?.photo_url ?? null,
    bio: bioResult.bio,
    titles: films.map((f) => ({ id: f.id, name: f.name, posterUrl: f.poster_url })),
  };
}
