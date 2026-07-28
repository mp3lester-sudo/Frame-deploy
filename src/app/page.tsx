import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getRecommendationsForUser } from "@/lib/recommendations/engine";
import { HeroRecommendation } from "@/components/home/hero-recommendation";
import { MoodRow } from "@/components/home/mood-row";
import { MovieNightCard } from "@/components/home/movie-night-card";
import { CircleFeed, type CircleEvent } from "@/components/home/circle-feed";

type Participant = { username: string; display_name: string | null; avatar_url: string | null };

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <section className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-6 py-24 text-center">
        <h1 className="font-display text-4xl sm:text-5xl">
          Never ask &ldquo;what should I watch&rdquo; again.
        </h1>
        <p className="max-w-xl text-lg text-foreground-muted">
          Frame learns your taste — pacing, tone, favorite directors, the things you can&apos;t stand —
          and turns it into three recommendations, not five hundred.
        </p>
        <Link
          href="/signup"
          className="inline-flex h-12 items-center rounded-[var(--radius-md)] bg-accent px-6 font-medium text-accent-foreground hover:brightness-110"
        >
          Get started
        </Link>
      </section>
    );
  }

  const [{ data: profile }, { count: ratedCount }, { recommendations, isColdStart }] = await Promise.all([
    supabase.from("profiles").select("username").eq("id", user.id).maybeSingle(),
    supabase.from("ratings").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    getRecommendationsForUser(user.id, { limit: 5 }),
  ]);

  const [hero, ...morePicks] = recommendations;

  let heroDirector: string | null = null;
  if (hero) {
    const { data: creditRow } = await supabase
      .from("title_credits")
      .select("people(name)")
      .eq("title_id", hero.title.id)
      .eq("credit_type", "director")
      .limit(1)
      .maybeSingle();
    heroDirector =
      (creditRow as unknown as { people: { name: string } | null } | null)?.people?.name ?? null;
  }

  // Active Movie Night (still collecting picks) that this user is part of —
  // only ever shown when real, never a placeholder invite.
  const { data: memberships } = await supabase
    .from("movie_night_participants")
    .select("movie_night_id")
    .eq("user_id", user.id);
  const nightIds = (memberships ?? []).map((m) => m.movie_night_id);

  let activeNight: { id: string; hostId: string; participants: Participant[] } | null = null;
  if (nightIds.length) {
    const { data: nights } = await supabase
      .from("movie_nights")
      .select("id, host_id, created_at")
      .in("id", nightIds)
      .eq("status", "collecting")
      .order("created_at", { ascending: false })
      .limit(1);
    const night = nights?.[0];
    if (night) {
      const { data: participantRows } = await supabase
        .from("movie_night_participants")
        .select("profiles(username, display_name, avatar_url)")
        .eq("movie_night_id", night.id);
      const participants = (participantRows ?? [])
        .map((r) => (r as unknown as { profiles: Participant | null }).profiles)
        .filter((p): p is Participant => !!p);
      activeNight = { id: night.id, hostId: night.host_id, participants };
    }
  }

  // Recent activity from people the user follows — omitted entirely rather
  // than shown with placeholder people when there's nothing real yet.
  const { data: following } = await supabase.from("follows").select("followee_id").eq("follower_id", user.id);
  const followeeIds = (following ?? []).map((f) => f.followee_id);

  let circleEvents: CircleEvent[] = [];
  if (followeeIds.length) {
    const { data: events } = await supabase
      .from("activity_events")
      .select("id, event_type, created_at, profiles(username, avatar_url), titles(name)")
      .in("user_id", followeeIds)
      .order("created_at", { ascending: false })
      .limit(3);
    circleEvents = (events ?? []) as unknown as CircleEvent[];
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const username = profile?.username ?? "you";

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <span className="font-display text-sm tracking-[0.2em] text-accent">FRAME</span>

      <h1 className="font-display mt-4 text-3xl">
        {greeting}, {username}.
      </h1>
      {ratedCount ? (
        <p className="mt-2 text-sm text-foreground-muted">
          {ratedCount} title{ratedCount === 1 ? "" : "s"} rated so far — tonight&apos;s picks are tuned to that.
        </p>
      ) : (
        <p className="mt-2 text-sm text-foreground-muted">
          Rate a few titles in{" "}
          <Link href="/taste-dna" className="text-accent hover:underline">
            Taste Training
          </Link>{" "}
          to sharpen these picks.
        </p>
      )}

      {hero && (
        <div className="mt-8">
          <HeroRecommendation
            title={hero.title}
            reason={hero.reason}
            matchPercent={isColdStart ? null : Math.round(Math.min(hero.score, 1) * 100)}
            director={heroDirector}
          />
        </div>
      )}

      {morePicks.length > 0 && (
        <div className="mt-8">
          <MoodRow picks={morePicks} isColdStart={isColdStart} />
        </div>
      )}

      {activeNight && (
        <div className="mt-8">
          <MovieNightCard
            nightId={activeNight.id}
            participants={activeNight.participants}
            isHost={activeNight.hostId === user.id}
          />
        </div>
      )}

      {circleEvents.length > 0 && (
        <div className="mt-8">
          <CircleFeed items={circleEvents} />
        </div>
      )}
    </div>
  );
}
