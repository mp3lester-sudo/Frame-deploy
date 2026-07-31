import { createServiceRoleClient } from "@/lib/supabase/server";
import { tmdbUrl, TMDB_IMAGE_BASE } from "@/lib/external/tmdb-client";

/**
 * Lazy fetch-on-view for person bio data, mirroring the RT score pattern:
 * the first visit to a /person/[id] page triggers a TMDB lookup, the result
 * is cached on the people row, subsequent visits are a free DB read.
 */

export interface PersonBioLookupInput {
  id: string;
  tmdb_id: number | null;
  bio: string | null;
  birthday: string | null;
  place_of_birth: string | null;
  bio_checked_at: string | null;
}

export interface PersonBio {
  bio: string | null;
  birthday: string | null;
  placeOfBirth: string | null;
}

export async function getOrFetchPersonBio(person: PersonBioLookupInput): Promise<PersonBio> {
  if (person.bio_checked_at) {
    return { bio: person.bio, birthday: person.birthday, placeOfBirth: person.place_of_birth };
  }

  const supabase = createServiceRoleClient();

  if (!person.tmdb_id) {
    // No TMDB id to look up against — mark checked so we don't retry forever.
    await supabase.from("people").update({ bio_checked_at: new Date().toISOString() }).eq("id", person.id);
    return { bio: null, birthday: null, placeOfBirth: null };
  }

  let result: PersonBio = { bio: null, birthday: null, placeOfBirth: null };

  try {
    const res = await fetch(tmdbUrl(`/person/${person.tmdb_id}`), { next: { revalidate: 86400 } });
    if (res.ok) {
      const data = await res.json();
      result = {
        bio: data.biography?.trim() || null,
        birthday: data.birthday || null,
        placeOfBirth: data.place_of_birth || null,
      };
    }
  } catch {
    // Network hiccup — don't cache, just retry next view.
    return { bio: person.bio, birthday: person.birthday, placeOfBirth: person.place_of_birth };
  }

  await supabase
    .from("people")
    .update({
      bio: result.bio,
      birthday: result.birthday,
      place_of_birth: result.placeOfBirth,
      bio_checked_at: new Date().toISOString(),
    })
    .eq("id", person.id);

  return result;
}


/**
 * Extra stills beyond the single cached portrait (people.photo_url) — a
 * small gallery of other TMDB profile shots for this person. Fetched live
 * per-request like tmdb-reviews.ts/tmdb-videos.ts (no DB storage: this is
 * read-only reference content, not something anything else depends on).
 */
export async function getTmdbPersonImages(tmdbId: number, limit = 10): Promise<string[]> {
  try {
    const res = await fetch(tmdbUrl(`/person/${tmdbId}/images`), { next: { revalidate: 86400 } });
    if (!res.ok) return [];
    const data = await res.json();
    const profiles: Array<{ file_path: string }> = data.profiles ?? [];
    return profiles.slice(0, limit).map((p) => `${TMDB_IMAGE_BASE}/w300${p.file_path}`);
  } catch {
    return [];
  }
}
