import { createClient } from "@/lib/supabase/server";

// How many poster tiles the auth-page backdrop shows -- matches the
// profile banner's collage (see profile/[username]/page.tsx), which uses
// the same "flex row of flush poster tiles + one shared gradient" trick.
const POSTER_COUNT = 5;

/**
 * A handful of high-popularity poster URLs for the login/signup/password
 * pages' collage backdrop. Unlike the profile banner (which collages a
 * specific user's favorites), these pages render before we know who's
 * visiting -- logged out entirely, in signup's case -- so this pulls from
 * the catalogue's most popular titles instead of anyone's personal list.
 * Same public-read titles table the landing page's anonymous taste teaser
 * already queries without a session, so no auth is required here either.
 */
export async function getAuthBackdropPosters(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("titles")
    .select("poster_url")
    .not("poster_url", "is", null)
    .order("popularity", { ascending: false })
    .limit(POSTER_COUNT);

  return (data ?? []).map((t) => t.poster_url).filter((url): url is string => !!url);
}
