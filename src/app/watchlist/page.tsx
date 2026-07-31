import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { TitleCard } from "@/components/title-card";

export default async function WatchlistPage() {
  const supabase = await createClient();
  const user = await getVerifiedUser();
  if (!user) redirect("/login?next=/watchlist");

  const { data: rows } = await supabase
    .from("watchlist")
    .select("added_at, titles(*)")
    .eq("user_id", user.id)
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
          Nothing here yet. Tap Watchlist on any movie page to add it.
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
