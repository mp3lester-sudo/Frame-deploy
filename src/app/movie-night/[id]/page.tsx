import Image from "@/components/ui/fade-image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { getCandidatesForMovieNight } from "@/lib/recommendations/movie-night";
import { reopenMovieNight, cancelMovieNight, type MovieNightParticipantRow } from "@/lib/actions/movie-night";
import { Button } from "@/components/ui/button";
import { InviteForm } from "@/components/movie-night/invite-form";
import { InviteLink } from "@/components/movie-night/invite-link";
import { siteOrigin } from "@/lib/seo/site";
import { PreferencesForm } from "@/components/movie-night/preferences-form";
import { LiveCandidateVoting } from "@/components/movie-night/live-candidate-voting";
import { LiveParticipants } from "@/components/movie-night/live-participants";
import { computeCompatibilityForUsers } from "@/lib/matchmaking/compute";
import { TasteCompatibilityCard } from "@/components/taste-compatibility-card";
import { captureServerError } from "@/lib/monitoring/sentry-server";

type ParticipantRow = MovieNightParticipantRow;

export default async function MovieNightDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getVerifiedUser();
  if (!user) redirect(`/login?next=/movie-night/${id}`);

  const { data: night } = await supabase
    .from("movie_nights")
    .select("id, host_id, status, decided_title_id, invite_token, created_at")
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

  // Taste comparison: how does the viewer's taste stack up against everyone
  // else in this session? For the common 2-person case (you + one invite)
  // this is exactly one card; scales to a short list for bigger groups.
  //
  // Wrapped per-participant so one person's edge-case data (a brand new
  // invite with an unusual taste_vectors/ratings shape, say) can't 500 the
  // whole page for the host and everyone else -- caught, logged to Sentry,
  // and just skipped, same as the host's own compatibility card would be
  // hidden by TasteCompatibilityCard's hasEnoughData check anyway.
  const otherParticipants = participants.filter((p) => p.user_id !== user.id);
  const comparisons = (
    await Promise.all(
      otherParticipants.map(async (p) => {
        try {
          return {
            userId: p.user_id,
            name: p.profiles?.display_name ?? p.profiles?.username ?? "them",
            compatibility: await computeCompatibilityForUsers(user.id, p.user_id),
          };
        } catch (err) {
          await captureServerError(err, { movieNightId: id, otherUserId: p.user_id, stage: "compatibility" });
          return null;
        }
      })
    )
  ).filter((c): c is NonNullable<typeof c> => c !== null);

  const decidedTitle = night.decided_title_id
    ? (await supabase.from("titles").select("*").eq("id", night.decided_title_id).maybeSingle()).data
    : null;

  // Every participant (not just the host) sees and votes on the shared
  // candidate pool now — see LiveCandidateVoting. A unanimous match decides
  // the night automatically (castMovieNightVote); if the pool runs dry with
  // no unanimous pick, any participant can break the tie via decideMovieNight.
  //
  // Same reasoning as comparisons above: a bad row anywhere in the group's
  // combined rating/genre-affinity data would otherwise 500 this whole
  // page for every participant, not just degrade the one feature that hit
  // it. LiveCandidateVoting already has a real empty-pool fallback UI, so
  // an empty array here is a legitimate degraded state, not a dead end.
  let candidates: Awaited<ReturnType<typeof getCandidatesForMovieNight>> = [];
  if (night.status === "collecting") {
    try {
      candidates = await getCandidatesForMovieNight(id, { viewerId: user.id });
    } catch (err) {
      await captureServerError(err, { movieNightId: id, stage: "candidates" });
    }
  }

  const { data: voteRows } = night.status === "collecting"
    ? await supabase
        .from("movie_night_votes")
        .select("title_id, user_id, vote")
        .eq("movie_night_id", id)
    : { data: null };
  const initialVotes = voteRows ?? [];

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

      <LiveParticipants movieNightId={id} hostId={night.host_id} initialParticipants={participants} />

      {comparisons.length > 0 && (
        <div className="mt-6 space-y-3">
          <p className="text-[11px] uppercase tracking-wider text-foreground-muted">Taste comparison</p>
          {comparisons.map((c) => (
            <TasteCompatibilityCard key={c.userId} compatibility={c.compatibility} otherName={c.name} />
          ))}
        </div>
      )}

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

          {isHost && (
            <div className="mt-6 flex flex-col gap-4">
              <div>
                <p className="mb-2 text-[11px] uppercase tracking-wider text-foreground-muted">
                  Invite anyone -- no account needed to preview
                </p>
                <InviteLink inviteLink={`${siteOrigin()}/movie-night/join/${night.invite_token}`} />
              </div>
              <div>
                <p className="mb-2 text-[11px] uppercase tracking-wider text-foreground-muted">
                  Or invite someone already on Backlot
                </p>
                <InviteForm movieNightId={night.id} />
              </div>
            </div>
          )}

          <div className="mt-8">
            <p className="mb-3 text-[11px] uppercase tracking-wider text-foreground-muted">
              Vote on picks everyone might like
            </p>
            <LiveCandidateVoting
              movieNightId={night.id}
              candidates={candidates}
              initialVotes={initialVotes}
              viewerId={user.id}
              participantCount={participants.length}
            />
          </div>

          {isHost && (
            <form action={cancelMovieNight.bind(null, night.id)} className="mt-6">
              <Button type="submit" size="sm" variant="ghost">
                Cancel this movie night
              </Button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
