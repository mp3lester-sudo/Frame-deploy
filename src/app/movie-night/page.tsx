import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { formatDistanceToNow } from "@/lib/date";
import { createMovieNight } from "@/lib/actions/movie-night";
import { Button } from "@/components/ui/button";
import { NightHeroTile } from "@/components/movie-night/night-hero-tile";
import { PastMovieNights, type PastNightRow } from "@/components/movie-night/past-movie-nights";
import { getActiveMediaType } from "@/lib/context/media-type";
import { movieNightLabel, movieNightLabelLower, movieNightsLabelLower } from "@/lib/copy/movie-night-copy";

export default async function MovieNightListPage() {
  const supabase = await createClient();
  const user = await getVerifiedUser();
  if (!user) redirect("/login?next=/movie-night");
  const mediaType = await getActiveMediaType();

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
  const activeNightIds = (nights ?? []).filter((n) => n.status === "collecting").map((n) => n.id);

  // Batched together since none of these four depend on each other's
  // results -- only on `nights`, which is already in hand. Fetching
  // vote rows for the active nights here (rather than a separate
  // sequential query) is what makes the live "X of Y voted" progress
  // bar on the hero tile possible without slowing the page down.
  const [
    { data: hosts },
    { data: decidedTitles },
    { data: allParticipants },
    { data: activeVotes },
  ] = await Promise.all([
    hostIds.length
      ? supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", hostIds)
      : Promise.resolve({ data: [] }),
    decidedTitleIds.length
      ? supabase.from("titles").select("id, name, poster_url").in("id", decidedTitleIds)
      : Promise.resolve({ data: [] }),
    nightIds.length
      ? supabase
          .from("movie_night_participants")
          .select("movie_night_id, user_id, profiles(username, display_name, avatar_url)")
          .in("movie_night_id", nightIds)
      : Promise.resolve({ data: [] }),
    activeNightIds.length
      ? supabase.from("movie_night_votes").select("movie_night_id, user_id").in("movie_night_id", activeNightIds)
      : Promise.resolve({ data: [] }),
  ]);

  const hostById = new Map((hosts ?? []).map((h) => [h.id, h]));
  const titleById = new Map((decidedTitles ?? []).map((t) => [t.id, t]));

  type ParticipantInfo = { username: string; display_name: string | null; avatar_url: string | null };
  const participantsByNight = new Map<string, ParticipantInfo[]>();
  for (const row of allParticipants ?? []) {
    const profile = row.profiles as unknown as ParticipantInfo | null;
    if (!profile) continue;
    const list = participantsByNight.get(row.movie_night_id) ?? [];
    list.push(profile);
    participantsByNight.set(row.movie_night_id, list);
  }

  const votedUsersByNight = new Map<string, Set<string>>();
  for (const row of activeVotes ?? []) {
    const set = votedUsersByNight.get(row.movie_night_id) ?? new Set<string>();
    set.add(row.user_id);
    votedUsersByNight.set(row.movie_night_id, set);
  }

  const activeNights = (nights ?? []).filter((n) => n.status === "collecting");
  const pastNights = (nights ?? []).filter((n) => n.status !== "collecting");

  return (
    <section className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-section-heading text-2xl">{movieNightLabel(mediaType)}</h1>
        <form action={createMovieNight}>
          <Button type="submit" size="sm">
            Start a {movieNightLabelLower(mediaType)}
          </Button>
        </form>
      </div>

      {!nights?.length && (
        <p className="mb-6 font-section-body text-sm text-foreground-muted">
          No {movieNightsLabelLower(mediaType)} yet. Start one above and invite friends by username -- Marquee will
          suggest something everyone&apos;s taste agrees on.
        </p>
      )}

      {/* Active (still collecting) nights get the big live-progress tile
          -- there's usually only one or two of these at a time. Decided
          and cancelled nights move into the poster grid below instead of
          staying in this same flat list forever, which is what made the
          page feel crowded once someone had run a handful of movie
          nights. */}
      {activeNights.length > 0 && (
        <div className="flex flex-col gap-3">
          {activeNights.map((night) => {
            const host = hostById.get(night.host_id);
            const participants = participantsByNight.get(night.id) ?? [];
            const votedCount = votedUsersByNight.get(night.id)?.size ?? 0;
            return (
              <NightHeroTile
                key={night.id}
                nightId={night.id}
                hostLabel={host?.id === user.id ? "You're hosting" : `Hosted by ${host?.display_name ?? host?.username ?? "someone"}`}
                participants={participants}
                votedCount={votedCount}
              />
            );
          })}
        </div>
      )}

      <PastMovieNights
        nights={pastNights.map((night): PastNightRow => {
          const host = hostById.get(night.host_id);
          const decidedTitle = night.decided_title_id ? titleById.get(night.decided_title_id) : null;
          const participants = participantsByNight.get(night.id) ?? [];
          return {
            id: night.id,
            status: night.status,
            hostLabel:
              host?.id === user.id
                ? "You're hosting"
                : `Hosted by ${host?.display_name ?? host?.username ?? "someone"}`,
            countLabel: `${participants.length || 1} people`,
            decidedTitleName: decidedTitle?.name ?? null,
            posterUrl: decidedTitle?.poster_url ?? null,
            dateLabel: formatDistanceToNow(night.created_at),
          };
        })}
      />
    </section>
  );
}
