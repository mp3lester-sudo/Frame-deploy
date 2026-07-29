import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getRecommendationsForUser } from "@/lib/recommendations/engine";
import { getRequestGeo } from "@/lib/geo";
import { getCurrentWeather } from "@/lib/weather";
import { HeroRecommendation } from "@/components/home/hero-recommendation";
import { MoodRow } from "@/components/home/mood-row";
import { MovieNightCard } from "@/components/home/movie-night-card";
import { CircleFeed, type CircleEvent } from "@/components/home/circle-feed";
import { ContextCards } from "@/components/home/context-cards";
import { ContextPicker } from "@/components/home/context-picker";
import { detectAutoContext, isCircumstantialContext } from "@/lib/context/circumstantial";

type Participant = { username: string; display_name: string | null; avatar_url: string | null };

// Home page is deliberately weighted ~60% personal (Taste Graph picks, tuned
// to whichever circumstantial context applies right now) and ~40% social
// (what people you follow are actually doing) — two distinct sections
// rather than one blended feed, so each stays legible on its own.
const SOCIAL_EVENTS_LIMIT = 5;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ context?: string }>;
}) {
  const { context: contextParam } = await searchParams;
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

  const geo = await getRequestGeo();

  const [{ data: profile }, { count: ratedCount }, weather] = await Promise.all([
    supabase.from("profiles").select("username, display_name").eq("id", user.id).maybeSingle(),
    supabase.from("ratings").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    geo?.latitude != null && geo?.longitude != null ? getCurrentWeather(geo.latitude, geo.longitude) : Promise.resolve(null),
  ]);

  // Real time in the visitor's own timezone (from Vercel's edge geolocation),
  // computed here (rather than lower down, where it used to live) because
  // the circumstantial context auto-detection needs it before recommendations
  // are fetched.
  const now = new Date();
  const zonedNow = geo?.timezone ? new Date(now.toLocaleString("en-US", { timeZone: geo.timezone })) : now;

  const autoContext = detectAutoContext({
    hour: zonedNow.getHours(),
    dayOfWeek: zonedNow.getDay(),
    weatherCode: weather?.code ?? null,
  });
  const activeContext = contextParam && isCircumstantialContext(contextParam) ? contextParam : autoContext;

  const { recommendations, isColdStart } = await getRecommendationsForUser(user.id, {
    limit: 5,
    context: activeContext,
  });

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
      .limit(SOCIAL_EVENTS_LIMIT);
    circleEvents = (events ?? []) as unknown as CircleEvent[];
  }

  const greeting = zonedNow.getHours() < 12 ? "Good morning" : zonedNow.getHours() < 18 ? "Good afternoon" : "Good evening";
  const day = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: geo?.timezone ?? undefined })
    .format(now)
    .toUpperCase();
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: geo?.timezone ?? undefined,
  }).format(now);
  const location = geo?.city ? [geo.city, geo.region].filter(Boolean).join(", ") : geo?.region ?? null;
  // Greet by first name — display_name is free text (could be "Michael
  // Lester" or just "Michael"), so only ever take its first word. Falls back
  // to username, then a generic "there" if neither is set yet.
  const rawName = profile?.display_name?.trim() || profile?.username || "there";
  const firstName = rawName.split(/\s+/)[0];

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <span className="font-hollywood text-xl uppercase tracking-[0.15em] text-accent">Frame</span>

      <div className="mt-5">
        <ContextCards day={day} time={time} location={location} weather={weather} />
      </div>

      <h1 className="font-display mt-6 text-3xl">
        {greeting}, {firstName}.
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

      <div className="mt-6">
        <ContextPicker active={activeContext} />
      </div>

      {hero && (
        <div className="mt-8">
          <HeroRecommendation
            title={hero.title}
            reason={hero.reason}
            detail={hero.detail}
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

      {/* Social section — what people you follow are actually doing, kept
          visually distinct from the personal picks above with a divider and
          its own eyebrow label rather than blended into one feed. */}
      <div className="mt-10 border-t border-border pt-6">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-foreground-muted">Your circle</span>
          <Link href="/hot-takes" className="text-[11px] uppercase tracking-wider text-foreground-muted hover:text-accent">
            Hot Takes &rarr;
          </Link>
        </div>

        {activeNight && (
          <div className="mt-4">
            <MovieNightCard
              nightId={activeNight.id}
              participants={activeNight.participants}
              isHost={activeNight.hostId === user.id}
            />
          </div>
        )}

        {circleEvents.length > 0 ? (
          <div className="mt-4">
            <CircleFeed items={circleEvents} />
          </div>
        ) : (
          !activeNight && (
            <p className="mt-4 text-sm text-foreground-muted">
              Follow a few people to see what they&apos;re watching here.
            </p>
          )
        )}
      </div>
    </div>
  );
}
