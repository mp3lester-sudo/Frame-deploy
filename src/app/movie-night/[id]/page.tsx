import Image from "@/components/ui/fade-image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCandidatesForMovieNight } from "@/lib/recommendations/movie-night";
import { reopenMovieNight, cancelMovieNight } from "@/lib/actions/movie-night";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { InviteForm } from "@/components/movie-night/invite-form";
import { PreferencesForm } from "@/components/movie-night/preferences-form";
import { CandidatePicker } from "@/components/movie-night/candidate-picker";

interface ParticipantRow {
  user_id: string;
  mood: string | null;
  excluded_genres: string[];
  profiles: { username: string; display_name: string | null; avatar_url: string | null } | null;
}

export default async function MovieNightDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/movie-night/${id}`);

  const { data: night } = await supabase
    .from("movie_nights")
    .select("id, host_id, status, decided_title_id, created_at")
    .eq("id", id)
    .maybeSingle();
  // RLS already restricts this to hosts/participants, so a null result here
  // means either it doesn't exist or you're not part of it — same UX either way.
  if (!night) notFound();

  const { data: participantRows } = await supabase
    .from("movie_night_participants")
    .select("user_id, mood, excluded_genres, profiles(username, display_name, avatar_url)")
    .eq("movie_night_id", id);
  const participants = (participantRows ?? []) as unknown as ParticipantRow[];

  const isHost = night.host_id === user.id;
  const me = participants.find((p) => p.user_id === user.id);

  const decidedTitle = night.decided_title_id
    ? (await supabase.from("titles").select("*").eq("id", night.decided_title_id).maybeSingle()).data
    : null;

  const candidates =
    night.status === "collecting" && isHost ? await getCandidatesForMovieNight(id) : [];

  return (
    <section className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/movie-night" className="text-xs text-foreground-muted hover:text-foreground">
        &larr; All movie nights
      </Link>

      <div className="mt-3 flex items-center justify-between">
        <h1 className="font-display text-2xl">Movie night</h1>
        <span className="text-xs uppercase tracking-wider text-accent">
          {night.status === "collecting" && "Collecting picks"}
          {night.status === "decided" && "Decided"}
          {night.status === "cancelled" && "Cancelled"}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {participants.map((p) => (
          <div key={p.user_id} className="flex items-center gap-2 rounded-[var(--radius-full)] border border-border bg-surface py-1.5 pl-1.5 pr-3">
            <Avatar
              name={p.profiles?.display_name ?? p.profiles?.username ?? "?"}
              src={p.profiles?.avatar_url}
              size={24}
            />
            <span className="text-xs">
              {p.profiles?.display_name ?? p.profiles?.username ?? "Unknown"}
              {p.user_id === night.host_id && " (host)"}
            </span>
            {p.mood && <span className="text-[11px] text-foreground-muted">&middot; {p.mood}</span>}
          </div>
        ))}
      </div>

      {night.status === "cancelled" && (
        <p className="mt-8 text-sm text-foreground-muted">This movie night was cancelled.</p>
      )}

      {night.status === "decided" && decidedTitle && (
        <div className="mt-8">
          <p className="mb-3 text-[11px] uppercase tracking-wider text-foreground-muted">The pick</p>
          <div className="flex gap-4 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
            <div className="relative h-36 w-24 shrink-0 overflow-hidden rounded-[var(--radius-md)] bg-surface-raised">
              {decidedTitle.poster_url && (
                <Image src={decidedTitle.poster_url} alt={decidedTitle.name} fill className="object-cover" />
              )}
            </div>
            <div>
              <Link href={`/movie/${decidedTitle.id}`} className="font-display text-xl hover:text-accent">
                {decidedTitle.name}
              </Link>
              {decidedTitle.overview && (
                <p className="mt-2 line-clamp-3 text-sm text-foreground-muted">{decidedTitle.overview}</p>
              )}
            </div>
          </div>
          {isHost && (
            <div className="mt-4 flex gap-2">
              <form action={reopenMovieNight.bind(null, night.id)}>
                <Button type="submit" size="sm" variant="secondary">
                  Reopen picks
                </Button>
              </form>
              <form action={cancelMovieNight.bind(null, night.id)}>
                <Button type="submit" size="sm" variant="ghost">
                  Cancel
                </Button>
              </form>
            </div>
          )}
        </div>
      )}

      {night.status === "collecting" && (
        <>
          <div className="mt-8">
            <PreferencesForm
              movieNightId={night.id}
              initialMood={me?.mood ?? null}
              initialExcludedGenres={me?.excluded_genres ?? []}
            />
          </div>

          {isHost ? (
            <>
              <div className="mt-6">
                <p className="mb-2 text-[11px] uppercase tracking-wider text-foreground-muted">
                  Invite someone
                </p>
                <InviteForm movieNightId={night.id} />
              </div>

              <div className="mt-8">
                <p className="mb-3 text-[11px] uppercase tracking-wider text-foreground-muted">
                  Picks everyone might like
                </p>
                <CandidatePicker movieNightId={night.id} candidates={candidates} />
              </div>

              <form action={cancelMovieNight.bind(null, night.id)} className="mt-6">
                <Button type="submit" size="sm" variant="ghost">
                  Cancel this movie night
                </Button>
              </form>
            </>
          ) : (
            <p className="mt-6 text-sm text-foreground-muted">
              Waiting on the host to pick something — set your mood and genres to exclude above so
              it factors into the pick.
            </p>
          )}
        </>
      )}
    </section>
  );
}
