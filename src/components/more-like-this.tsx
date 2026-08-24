import { createClient } from "@/lib/supabase/server";
import { TitleCard, type GridTitle } from "@/components/title-card";
import type { MediaType } from "@/lib/context/media-type-cookie";
import { captureServerError } from "@/lib/monitoring/sentry-server";

/**
 * "More like this" rail on the movie/show detail page -- discovery-depth-
 * audit rendition #1. The single biggest dead end the audit found: the
 * highest-traffic page in the app had cast/crew links and trailers, but
 * nothing that continued the session once you'd finished reading about
 * this one title. Backed by the similar_titles RPC (migration 0086), a
 * pure title-to-title embedding-similarity lookup with no user context
 * needed -- so it works the same for a logged-out visitor as a signed-in
 * one, unlike every other similarity RPC in this codebase which is
 * anchored to a taste vector or rating history.
 *
 * Server component, not client -- one Supabase round trip alongside
 * everything else the movie page already fetches, no separate loading
 * state needed.
 */
export async function MoreLikeThis({ titleId, mediaType }: { titleId: string; mediaType: MediaType }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("similar_titles", {
    p_title_id: titleId,
    p_match_count: 10,
    p_media_type: mediaType,
  });

  if (error) {
    // Genuine RPC failure (missing function, bad grant, etc.) -- distinct
    // from the legitimate "no embedding yet" case below, which returns an
    // empty array rather than an error.
    console.error("[more-like-this] similar_titles RPC error", { titleId, mediaType, error });
    await captureServerError(error, { titleId, mediaType, rpc: "similar_titles" });
    return null;
  }

  if (!data || data.length === 0) {
    // TEMP diagnostic (task #746) -- distinguishing "legit no embedding"
    // from a real bug while live-verifying the rail. Remove once confirmed.
    console.log("[more-like-this] similar_titles returned no rows", { titleId, mediaType, rowCount: data?.length ?? null });
    return null;
  }

  const { data: titles, error: titlesError } = await supabase
    .from("titles")
    .select("id, name, poster_url, type, in_production")
    .in(
      "id",
      data.map((d) => d.title_id)
    );

  if (titlesError) {
    await captureServerError(titlesError, { titleId, mediaType, step: "fetch-titles" });
    return null;
  }

  if (!titles || titles.length === 0) return null;

  // similar_titles already returns closest-first -- re-order the fetched
  // rows to match rather than trusting whatever order .in() happens to
  // return them in.
  const byId = new Map(titles.map((t) => [t.id, t as GridTitle]));
  const ordered = data.map((d) => byId.get(d.title_id)).filter((t): t is GridTitle => !!t);

  if (ordered.length === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="mb-3 font-display text-lg">More like this</h2>
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
        {ordered.map((title, i) => (
          <div key={title.id} className="w-32 shrink-0 snap-start sm:w-36">
            <TitleCard title={title} index={i} />
          </div>
        ))}
      </div>
    </div>
  );
}
