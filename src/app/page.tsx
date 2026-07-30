import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { getRecommendationsForUser } from "@/lib/recommendations/engine";
import { getLandingSwipeDeck } from "@/lib/actions/landing-teaser";
import { TasteTeaser } from "@/components/landing/taste-teaser";
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
  const user = await getVerifiedUser();

  if (!user) {
    const deck = await getLandingSwipeDeck();
    return (
      <section className="mx-auto flex max-w-3xl flex-col items-center gap-10 px-6 py-16 text-center sm:py-24">
        <div className="flex flex-col items-center gap-6">
          <h1 className="font-display text-4xl sm:text-5xl">
            Never ask &ldquo;what should I watch&rdquo; again.
          </h1>
          <p className="max-w-xl text-lg text-foreground-muted">
            Backlot learns your taste — pacing, tone, favorite directors, the things you can&apos;t stand —
            and turns it into three recommendations, not five hundred. Try it below before you sign up.
          </p>
        </div>

        {deck.length > 0 ? (
          <TasteTeaser deck={deck} />
        ) : (
          <Link
            href="/signup"
            className="inline-flex h-12 items-center rounded-[var(--radius-md)] bg-gold-foil px-6 font-medium text-accent-foreground shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_8px_20px_-8px_rgba(205,166,70,0.55)] hover:brightness-110"
          >
            Get started
          </Link>
        )}
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

  // These three don't depend on each other's results (recommendations,
  // this user's Movie Night membership, and who they follow are all
  // independent lookups), so they used to run one after another purely
  // because they were each written as their own top-level `await` — a
  // waterfall that added up on the single heaviest page in the app. Now
  // they run concurrently; only the follow-on queries below (which director
  // for the hero pick, which specific night, whose activity) are genuinely
  // sequential, since each needs an id from the batch above.
  const [{ recommendations, isColdStart }, { data: memberships }, { data: following }] = await Promise.all([
    getRecommendationsForUser(user.id, {
      limit: 5,
      context: activeContext,
      weather: { weatherCode: weather?.code ?? null, tempF: weather?.tempF ?? null, hour: zonedNow.getHours() },
    }),
    // Active Movie Night (still collecting picks) that this user is part of
    // — only ever shown when real, never a placeholder invite.
    supabase.from("movie_night_participants").select("movie_night_id").eq("user_id", user.id),
    // Recent activity from people the user follows — omitted entirely
    // rather than shown with placeholder people when there's nothing real yet.
    supabase.from("follows").select("followee_id").eq("follower_id", user.id),
  ]);

  const [hero, ...morePicks] = recommendations;
  const nightIds = (memberships ?? []).map((m) => m.movie_night_id);
  const followeeIds = (following ?? []).map((f) => f.followee_id);

  const [heroDirectorResult, night, events] = await Promise.all([
    hero
      ? supabase
          .from("title_credits")
          .select("people(name)")
          .eq("title_id", hero.title.id)
          .eq("credit_type", "director")
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    nightIds.length
      ? supabase
          .from("movie_nights")
          .select("id, host_id, created_at")
          .in("id", nightIds)
          .eq("status", "collecting")
          .order("created_at", { ascending: false })
          .limit(1)
          .then((r) => r.data?.[0] ?? null)
      : Promise.resolve(null),
    followeeIds.length
      ? supabase
          .from("activity_events")
          .select("id, event_type, created_at, profiles(username, avatar_url), titles(name)")
          .in("user_id", followeeIds)
          .order("created_at", { ascending: false })
          .limit(SOCIAL_EVENTS_LIMIT)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
  ]);

  const heroDirector =
    (heroDirectorResult?.data as unknown as { people: { name: string } | null } | null)?.people?.name ?? null;

  let activeNight: { id: string; hostId: string; participants: Participant[] } | null = null;
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

  const circleEvents = events as unknown as CircleEvent[];

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
      <span className="font-hollywood text-xl uppercase tracking-[0.15em] text-accent">Backlot</span>

      <div className="mt-2">
        <ContextCards day={day} time={time} location={location} weather={weather} />
      </div>

      <h1 className="font-display mt-5 text-3xl">
        {greeting}, {firstName}.
      </h1>
      {ratedCount ? (
        <p className="mt-1.5 text-sm text-foreground-muted">Tonight&apos;s picks are tuned to your ratings.</p>
      ) : (
        <p className="mt-1.5 text-sm text-foreground-muted">
          Rate a few titles in{" "}
          <Link href="/taste-dna" className="text-accent hover:underline">
            Taste Training
          </Link>{" "}
          to sharpen these picks.
        </p>
      )}

      <div className="mt-5">
        <ContextPicker active={activeContext} />
      </div>

      {hero && (
        <div className="mt-7">
          <HeroRecommendation
            title={hero.title}
            reason={hero.reason}
            detail={hero.detail}
            matchPercent={hero.matchPercent}
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
