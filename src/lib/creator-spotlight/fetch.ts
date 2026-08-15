import { createClient } from "@/lib/supabase/server";
import { getOrFetchPersonBio } from "@/lib/external/tmdb-person";
import { rankFavoriteCreators, pickCreatorOfDay } from "./pick";

// Mirrors director-of-day/fetch.ts's SHORTLIST_SIZE -- see that file's
// comment for the reasoning (long no-repeat runway, still bounded).
const SHORTLIST_SIZE = 100;

// How many of the creator's shows to display, most popular first.
const SHOWS_LIMIT = 10;

export interface CreatorSpotlightData {
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
 * Shows-mode analog of getDirectorOfTheDay (see that file for the shared
 * shape/pattern this mirrors). Ranks by the 'creator' credit type
 * (migration 0073) instead of 'director', and only considers ratings for
 * TV titles -- a user's movie ratings shouldn't influence which
 * showrunner gets spotlighted here, same "no bleeding between modes"
 * rule the rest of the Movies/Shows split follows.
 */
export async function getCreatorSpotlight(userId: string): Promise<CreatorSpotlightData | null> {
  const supabase = await createClient();

  const { data: ratings } = await supabase
    .from("ratings")
    .select("title_id, score, titles!inner(type)")
    .eq("user_id", userId)
    .eq("titles.type", "tv");
  if (!ratings?.length) return null;

  const titleIds = ratings.map((r) => r.title_id);

  const { data: creatorCredits } = await supabase
    .from("title_credits")
    .select("title_id, people(id, name, photo_url, tmdb_id, bio, birthday, place_of_birth, bio_checked_at)")
    .eq("credit_type", "creator")
    .in("title_id", titleIds);

  type CreatorRow = {
    id: string;
    name: string;
    photo_url: string | null;
    tmdb_id: number | null;
    bio: string | null;
    birthday: string | null;
    place_of_birth: string | null;
    bio_checked_at: string | null;
  };

  const creatorByTitle = new Map<string, { id: string; name: string }>();
  const creatorRowById = new Map<string, CreatorRow>();
  for (const c of creatorCredits ?? []) {
    const person = (c as unknown as { people: CreatorRow | null }).people;
    if (!person) continue;
    creatorByTitle.set(c.title_id, { id: person.id, name: person.name });
    creatorRowById.set(person.id, person);
  }

  const ranked = rankFavoriteCreators(
    ratings.map((r) => ({ titleId: r.title_id, score: Number(r.score) })),
    creatorByTitle
  );
  const shortlist = ranked.slice(0, SHORTLIST_SIZE);
  if (!shortlist.length) return null;

  const dateKey = new Date().toISOString().slice(0, 10);
  const pick = pickCreatorOfDay(shortlist, userId, dateKey);
  if (!pick) return null;

  const creatorRow = creatorRowById.get(pick.id);

  const [bioResult, titlesResult] = await Promise.all([
    creatorRow
      ? getOrFetchPersonBio({
          id: creatorRow.id,
          tmdb_id: creatorRow.tmdb_id,
          bio: creatorRow.bio,
          birthday: creatorRow.birthday,
          place_of_birth: creatorRow.place_of_birth,
          bio_checked_at: creatorRow.bio_checked_at,
        })
      : Promise.resolve({ bio: null, birthday: null, placeOfBirth: null }),
    supabase
      .from("title_credits")
      .select("titles(id, name, poster_url, popularity)")
      .eq("person_id", pick.id)
      .eq("credit_type", "creator"),
  ]);

  type ShowRow = { id: string; name: string; poster_url: string | null; popularity: number | null };
  const shows = ((titlesResult.data ?? []) as unknown as { titles: ShowRow | null }[])
    .map((r) => r.titles)
    .filter((t): t is ShowRow => !!t)
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .slice(0, SHOWS_LIMIT);

  return {
    id: pick.id,
    name: pick.name,
    photoUrl: creatorRow?.photo_url ?? null,
    bio: bioResult.bio,
    titles: shows.map((s) => ({ id: s.id, name: s.name, posterUrl: s.poster_url })),
  };
}
