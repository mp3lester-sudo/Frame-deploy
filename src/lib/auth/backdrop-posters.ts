import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import type { Database } from "@/lib/supabase/types";
import { captureServerError } from "@/lib/monitoring/sentry-server";

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

  // The `error` half of this used to be discarded outright (`const { data
  // } = await ...`), so a live P0 bug -- the backdrop rendering zero
  // images in production -- left no trace anywhere: no thrown exception
  // (Postgrest errors don't throw through supabase-js), no Sentry event,
  // nothing in Vercel's runtime logs. Confirmed live via
  // get_runtime_errors: zero errors recorded for /login despite the
  // backdrop visibly being empty. Capturing (not throwing) both the error
  // case and the "query succeeded but returned nothing" case here so the
  // next time this breaks, it's visible instead of silent -- the caller
  // still gets an empty array either way and the page still renders fine
  // without a backdrop, exactly as before.
  const { data, error } = await supabase
    .from("titles")
    .select("poster_url")
    .not("poster_url", "is", null)
    .order("popularity", { ascending: false })
    .limit(POSTER_COUNT);

  if (error) {
    // console.error too (not just Sentry) -- this project's SENTRY_DSN
    // may not be configured in every environment, and a Sentry no-op
    // must not be the only way this is ever visible.
    console.error("getAuthBackdropPosters query error:", error);
    await captureServerError(error, { source: "getAuthBackdropPosters" });
    return [];
  }
  if (!data || data.length === 0) {
    console.error("getAuthBackdropPosters: query returned zero rows");
    await captureServerError(new Error("getAuthBackdropPosters: query returned zero rows"), {
      source: "getAuthBackdropPosters",
    });
  }

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
