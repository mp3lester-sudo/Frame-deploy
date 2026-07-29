import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createMovieNight } from "@/lib/actions/movie-night";
import { Button } from "@/components/ui/button";

const STATUS_LABEL: Record<string, string> = {
  collecting: "Collecting picks",
  decided: "Decided",
  cancelled: "Cancelled",
};

export default async function MovieNightListPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/movie-night");

  const { data: memberships } = await supabase
    .from("movie_night_participants")
    .select("movie_night_id")
    .eq("user_id", user.id);

  const nightIds = (memberships ?? []).map((m) => m.movie_night_id);

  const { data: nights } = nightIds.length
    ? await supabase
        .from("movie_nights")
        .select("id, host_id, status, decided_title_id, created_at")
        .in("id", nightIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  const hostIds = [...new Set((nights ?? []).map((n) => n.host_id))];
  const decidedTitleIds = (nights ?? [])
    .map((n) => n.decided_title_id)
    .filter((id): id is string => !!id);

  const [{ data: hosts }, { data: decidedTitles }, { data: participantCounts }] = await Promise.all([
    hostIds.length
      ? supabase.from("profiles").select("id, username, display_name").in("id", hostIds)
      : Promise.resolve({ data: [] }),
    decidedTitleIds.length
      ? supabase.from("titles").select("id, name").in("id", decidedTitleIds)
      : Promise.resolve({ data: [] }),
    nightIds.length
      ? supabase.from("movie_night_participants").select("movie_night_id").in("movie_night_id", nightIds)
      : Promise.resolve({ data: [] }),
  ]);

  const hostById = new Map((hosts ?? []).map((h) => [h.id, h]));
  const titleById = new Map((decidedTitles ?? []).map((t) => [t.id, t]));
  const countByNight = new Map<string, number>();
  for (const row of participantCounts ?? []) {
    countByNight.set(row.movie_night_id, (countByNight.get(row.movie_night_id) ?? 0) + 1);
  }

  return (
    <section className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl">Movie night</h1>
        <form action={createMovieNight}>
          <Button type="submit" size="sm">
            Start a movie night
          </Button>
        </form>
      </div>

      {!nights?.length ? (
        <p className="text-sm text-foreground-muted">
          No movie nights yet. Start one and invite friends by username — Backlot will suggest
          something everyone&apos;s taste agrees on.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {nights.map((night) => {
            const host = hostById.get(night.host_id);
            const decidedTitle = night.decided_title_id ? titleById.get(night.decided_title_id) : null;
            return (
              <Link
                key={night.id}
                href={`/movie-night/${night.id}`}
                className="flex items-center justify-between rounded-[var(--radius-md)] border border-border bg-surface p-4 hover:border-border-strong"
              >
                <div>
                  <p className="text-sm font-medium">
                    {host?.id === user.id ? "You're hosting" : `Hosted by ${host?.display_name ?? host?.username ?? "someone"}`}
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-wider text-foreground-muted">
                    {countByNight.get(night.id) ?? 1} people &middot;{" "}
                    {decidedTitle ? decidedTitle.name : STATUS_LABEL[night.status]}
                  </p>
                </div>
                <span className="text-xs uppercase tracking-wider text-accent">
                  {STATUS_LABEL[night.status]}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
