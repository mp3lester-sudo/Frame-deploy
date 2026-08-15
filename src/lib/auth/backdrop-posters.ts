import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import type { Database } from "@/lib/supabase/types";

// How many poster tiles the auth-page backdrop shows -- matches the
// profile banner's collage (see profile/[username]/page.tsx), which uses
// the same "flex row of flush poster tiles + one shared gradient" trick.
const POSTER_COUNT = 5;

// The "most popular titles right now" ordering only meaningfully changes
// on the timescale of a TMDB popularity refresh, not per-request -- every
// visitor to /login or /signup was re-running this query from scratch on
// every single page load. Cached for an hour and shared across all
// visitors instead.
const REVALIDATE_SECONDS = 60 * 60;

async function fetchAuthBackdropPosters(): Promise<string[]> {
  // Plain anon client, not the request-scoped createClient() from
  // lib/supabase/server.ts -- that one reads cookies() to attach the
  // visitor's session, and Next disallows calling cookies()/headers()
  // inside a function wrapped by unstable_cache (the whole point of the
  // cache is a value shared across different visitors/requests). This
  // data is fully public and never varies by viewer, so an anon-key
  // client with no session needs is the right tool here anyway.
  const supabase = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  const { data } = await supabase
    .from("titles")
    .select("poster_url")
    .not("poster_url", "is", null)
    .order("popularity", { ascending: false })
    .limit(POSTER_COUNT);

  return (data ?? []).map((t) => t.poster_url).filter((url): url is string => !!url);
}

/**
 * A handful of high-popularity poster URLs for the login/signup/password
 * pages' collage backdrop. Unlike the profile banner (which collages a
 * specific user's favorites), these pages render before we know who's
 * visiting -- logged out entirely, in signup's case -- so this pulls from
 * the catalogue's most popular titles instead of anyone's personal list.
 */
export const getAuthBackdropPosters = unstable_cache(fetchAuthBackdropPosters, ["auth-backdrop-posters"], {
  revalidate: REVALIDATE_SECONDS,
});
