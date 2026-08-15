import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { TitleCard } from "@/components/title-card";
import { getActiveMediaType } from "@/lib/context/media-type";

export default async function WatchlistPage() {
  const supabase = await createClient();
  const user = await getVerifiedUser();
  if (!user) redirect("/login?next=/watchlist");

  // Scoped to the active Movies/Shows toggle -- every other feature
  // (Discover, Home, Movie Night, Wrapped, Taste DNA, the Pyramid,
  // ratings/taste vectors) already got this split when media_type
  // shipped; Watchlist was missed, so a Shows-mode visitor was seeing
  // their movies mixed in here. titles!inner scopes the join itself
  // (not just a post-filter), same pattern as signature-pick.ts /
  // creator-spotlight/fetch.ts / onboarding.ts.
  const mediaType = await getActiveMediaType();
  const { data: rows } = await supabase
    .from("watchlist")
    .select("added_at, titles!inner(*)")
    .eq("user_id", user.id)
    .eq("titles.type", mediaType)
    .order("added_at", { ascending: false });

  const titles = (rows ?? [])
    .map((r) => (r as unknown as { titles: Parameters<typeof TitleCard>[0]["title"] | null }).titles)
    .filter((t): t is Parameters<typeof TitleCard>[0]["title"] => !!t);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-display text-2xl">Watchlist</h1>
      <p className="mt-1 text-sm text-foreground-muted">
        Titles you&apos;ve queued up to watch — private to you, same as Letterboxd&apos;s.
      </p>

      {titles.length === 0 ? (
        <p className="mt-8 text-sm text-foreground-muted">
          Nothing here yet. Tap Watchlist on any {mediaType === "tv" ? "show" : "movie"} page to add it.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
          {titles.map((t) => (
            <TitleCard key={t.id} title={t} />
          ))}
        </div>
      )}
    </div>
  );
}
