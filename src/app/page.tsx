import Link from "next/link";
import { Allura } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { getRecommendationsForUser } from "@/lib/recommendations/engine";
import { getLandingSwipeDeck } from "@/lib/actions/landing-teaser";
import { TasteTeaser } from "@/components/landing/taste-teaser";
import { getRequestGeo } from "@/lib/geo";
import { getCurrentWeather } from "@/lib/weather";
import { RecommendationReveal, type RevealPick } from "@/components/home/recommendation-reveal";
import { MoodRow } from "@/components/home/mood-row";
import { MovieNightCard } from "@/components/home/movie-night-card";
import { createMovieNight } from "@/lib/actions/movie-night";
import { Clapperboard } from "lucide-react";
import { CircleFeed, type CircleEvent } from "@/components/home/circle-feed";
import { ContextCards } from "@/components/home/context-cards";
import { ContextPicker } from "@/components/home/context-picker";
import { CompanionPicker } from "@/components/home/companion-picker";
import { HiddenGemCard } from "@/components/home/hidden-gem-card";
import { getHiddenGemForUser } from "@/lib/recommendations/hidden-gem";
import { isCircumstantialContext } from "@/lib/context/circumstantial";
import { PreciseLocation } from "@/components/home/precise-location";
import { IndieSpotlightSection, IndieSpotlightSkeleton } from "@/components/home/indie-spotlight";
import type { Recommendation } from "@/lib/recommendations/engine";
import { Suspense } from "react";

type Participant = { username: string; display_name: string | null; avatar_url: string | null };

// Home page is deliberately weighted ~60% personal (Taste Graph picks, tuned
// to whichever circumstantial context applies right now) and ~40% social
// (what people you follow are actually doing) — two distinct sections
// rather than one blended feed, so each stays legible on its own.
const SOCIAL_EVENTS_LIMIT = 5;

const allura = Allura({ subsets: ["latin"], weight: "400" });

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
  // getRecommendationsForUser's weather/time weighting needs the hour before
  // recommendations are fetched.
  const now = new Date();
  const zonedNow = geo?.timezone ? new Date(now.toLocaleString("en-US", { timeZone: geo.timezone })) : now;

  // "/" (tapping Home/the logo, with no ?context=) always lands on Solo --
  // used to auto-detect a context from the clock/weather instead (evenings
  // on Fri/Sat defaulted to With friends, late night or rough weather
  // defaulted to Background), but that meant the same tap on Home could
  // land somewhere different depending on when you happened to open the
  // app, which read as unpredictable rather than helpful. Solo is always
  // the first destination now; the other contexts are still one tap away
  // via ContextPicker for whoever actually wants them.
  const activeContext = contextParam && isCircumstantialContext(contextParam) ? contextParam : "solo";

  // These three don't depend on each other's results (recommendations,
  // this user's Movie Night membership, and who they follow are all
  // independent lookups), so they used to run one after another purely
  // because they were each written as their own top-level `await` — a
  // waterfall that added up on the single heaviest page in the app. Now
  // they run concurrently; only the follow-on queries below (which director
  // for the hero pick, which specific night, whose activity) are genuinely
  // sequential, since each needs an id from the batch above.
  // "Date night" and "With friends" hand off entirely to the ad-hoc
  // companion picker below (CompanionPicker) -- they need a second real
  // person's taste before any recommendation is meaningful, so the solo
  // engine (which only ever knows about this one user) isn't run for these
  // two contexts at all, saving the pgvector/weather work for a result
  // nobody would see.
  const isCompanionContext = activeContext === "date_night" || activeContext === "with_friends";

  const [{ recommendations, isColdStart }, { data: memberships }, { data: following }] = await Promise.all([
    isCompanionContext
      ? Promise.resolve({ recommendations: [] as Recommendation[], isColdStart: false })
      : getRecommendationsForUser(user.id, {
          // 1 hero + 6 for MoodRow ("More picks for you") + 2 held in
          // reserve purely for RecommendationReveal's "Generate another
          // pick" cycle -- the reserve pair is deliberately never passed
          // to MoodRow, so tapping "generate another" on the hero can
          // never show a poster that's already visible in the rail below it.
          limit: 9,
          context: activeContext,
          weather: { weatherCode: weather?.code ?? null, tempF: weather?.tempF ?? null, hour: zonedNow.getHours() },
        }),
    // Active Movie Night (still collecting picks) that this user is part of
    // — only ever shown when real, never a placeholder invite.
    supabase.from("movie_night_participants").select("movie_night_id").eq("user_id", user.id),
    // Recent activity from people the user follows — omitted entirely
    // rather than shown with placeholder people when there's nothing real yet.
    supabase.from("follows").select("followee_id").eq("follower_id", user.id),
    // Indie Spotlight (four live trade-press RSS feeds + best-effort image
    // scraping) used to ride along in this same batch -- it's the least
    // time-sensitive thing on the page but was blocking the hero
    // recommendation behind it on every single request. It's now its own
    // <Suspense> boundary further down instead (see IndieSpotlightSection),
    // so a slow/rate-limiting outlet only delays that one section, not the
    // whole page.
  ]);

  const hero = recommendations[0];
  const morePicks = recommendations.slice(1, 7);
  // See the `limit: 9` comment above -- these two never render in MoodRow.
  const heroReserve = recommendations.slice(7, 9);
  const heroPool = hero ? [hero, ...heroReserve] : [];
  const nightIds = (memberships ?? []).map((m) => m.movie_night_id);
  const followeeIds = (following ?? []).map((f) => f.followee_id);

  const [heroPoolDirectorsResult, night, events, hiddenGem] = await Promise.all([
    // Batched across the whole hero pool (hero + reserve), not just hero
    // alone -- RecommendationReveal's "Generate another pick" can land on
    // any of them, so each one needs its own director for the meta line
    // rather than only the one shown first.
    heroPool.length
      ? supabase
          .from("title_credits")
          .select("title_id, people(name)")
          .in(
            "title_id",
            heroPool.map((r) => r.title.id)
          )
          .eq("credit_type", "director")
      : Promise.resolve({ data: [] }),
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
    // Replaces Director of the Day in this slot (moved to /daily) -- a
    // single high-match, low-popularity pick from this user's own taste
    // vector. Excludes whatever's already shown in the hero/mood row so it
    // never repeats a pick. Independent of companion context, same as
    // Director of the Day was -- it's this user's own taste, not a blended
    // one, so it stays visible in date-night/with-friends mode too
    // (recommendations is just an empty array there, so excludeIds is too).
    getHiddenGemForUser(
      user.id,
      recommendations.map((r) => r.title.id)
    ),
  ]);

  const directorByTitleId = new Map<string, string>();
  for (const row of (heroPoolDirectorsResult?.data ?? []) as unknown as {
    title_id: string;
    people: { name: string } | null;
  }[]) {
    if (!directorByTitleId.has(row.title_id) && row.people?.name) {
      directorByTitleId.set(row.title_id, row.people.name);
    }
  }
  const heroRevealPicks: RevealPick[] = heroPool.map((r) => ({
    title: r.title,
    reason: r.reason,
    detail: r.detail,
    matchPercent: r.matchPercent,
    director: directorByTitleId.get(r.title.id) ?? null,
  }));
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
    <div className="mx-auto max-w-xl px-4 py-10 lg:max-w-6xl">
      <PreciseLocation />
      {/* Server-rendered (not a client component) so it's part of the
          very first HTML the browser paints -- a client-mounted overlay
          would only appear after JS hydrates, by which point the home
          page underneath (recommendations included) has usually already
          painted, showing the wrong thing first. This inline script runs
          synchronously as the browser parses the page, before anything
          below it paints: on a fresh session it marks the flag and lets
          the splash render+animate normally; on a repeat visit within
          the same session it flags <html> so the CSS rule right below
          (html.splash-shown .greeting-splash) hides it instantly, no
          animation, no flash. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `try {
  if (sessionStorage.getItem('backlot:cinematic-intro-shown')) {
    document.documentElement.classList.add('intro-shown');
  } else {
    sessionStorage.setItem('backlot:cinematic-intro-shown', '1');
  }
  if (sessionStorage.getItem('backlot:greeting-splash-shown')) {
    document.documentElement.classList.add('splash-shown');
  } else {
    sessionStorage.setItem('backlot:greeting-splash-shown', '1');
  }
} catch (e) {}`,
        }}
      />
      {/* Vintage cinematic intro -- same public-domain footage as the
          onboarding flow's first-run sequence (see onboarding-swipe.tsx),
          now also playing at the top of every fresh Home session, not
          just right after signup. Built the same server-rendered, zero-
          client-JS way as the greeting splash right below it (CSS
          keyframes only, gated by the html.intro-shown class the inline
          script above sets) rather than porting onboarding's stateful
          React version -- there's no Skip button here because both
          layers are pointer-events-none, so they never block the page
          underneath; a user can start scrolling/tapping immediately if
          they don't want to wait. The intro-shown flag is shared with
          onboarding's own key, so a just-signed-up user redirected here
          doesn't see the same footage twice in a row -- they still get
          the greeting splash below, though (see the delay rule in
          globals.css keyed off :not(.intro-shown)).

          Wrapped in a tap-zone div (id below) so a tap/click anywhere
          dismisses the whole intro instantly instead of waiting out the
          fade -- the plain <script> right after registers the one
          listener needed for that, same zero-framework approach as the
          sessionStorage script above (no client component needed just
          for this). The video/title layers themselves stay
          pointer-events-none so the tap-zone (not them) is what's
          actually clickable. */}
      <div id="cinematic-intro-tapzone" className="fixed inset-0 z-[60] cursor-pointer">
        <div className="cinematic-intro-video pointer-events-none absolute inset-0 z-[2] overflow-hidden bg-black" aria-hidden="true">
          <video autoPlay muted loop playsInline className="onboarding-intro-zoom absolute inset-0 h-full w-full object-contain" style={{ filter: "grayscale(1) contrast(1.15) brightness(0.85)" }}>
            <source src="/videos/onboarding-intro.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.85) 100%)" }} />
          <div className="onboarding-intro-grain absolute inset-0" />
        </div>
        <div className="cinematic-intro-title pointer-events-none absolute inset-0 z-[1] flex flex-col items-center justify-center overflow-hidden bg-[#0A0A09]" aria-hidden="true">
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, rgba(255,250,235,0.09) 0%, transparent 60%)" }} />
          <div className="onboarding-intro-grain absolute inset-0" />
          <p className="text-gold-foil font-hollywood relative text-5xl tracking-[0.3em]">Backlot</p>
          <div className="relative my-4 h-px w-16 bg-white/40" />
          <p className="font-display relative text-sm italic text-white/60">a picture house, for your taste</p>
        </div>
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `try {
  var tz = document.getElementById('cinematic-intro-tapzone');
  if (tz) {
    tz.addEventListener('click', function () {
      document.documentElement.classList.add('cinematic-intro-dismissed');
    }, { once: true });
  }
} catch (e) {}`,
        }}
      />
      {/* Screen-centered marquee card -- both axes, via fixed inset-0
          flex centering -- rather than the inline "Good evening Name"
          sentence the persistent in-page heading below still uses.
          Thin rule lines above and below the name (same accent-deep
          hairline both times) frame it like a vintage title card. The
          greeting word now matches the Backlot wordmark's own typeface
          (font-hollywood -> Bebas Neue, see nav-bar.tsx); the name stays
          Allura cursive, per product direction (reversed from an earlier
          pass). */}
      <div
        className="greeting-splash pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background"
        aria-hidden="true"
      >
        <span className="font-hollywood text-3xl text-accent-soft sm:text-4xl">{greeting}</span>
        <div className="h-px w-40 bg-gradient-to-r from-transparent via-accent-deep to-transparent sm:w-56" />
        <span className={`${allura.className} text-5xl text-accent-soft sm:text-7xl`}>
          {firstName}
        </span>
        <div className="h-px w-40 bg-gradient-to-r from-transparent via-accent-deep to-transparent sm:w-56" />
      </div>
      {/* Backlot wordmark removed from this header per request -- it
          already lives in the nav bar above, so repeating it here was
          redundant. The day/time/location/weather line now centers on
          its own at the top of the page instead of trailing a title. */}
      <div className="flex justify-center">
        <ContextCards day={day} time={time} location={location} weather={weather} />
      </div>

      <h1 className="mt-5 text-center text-4xl leading-tight tracking-tight sm:text-5xl">
        {/* "Good evening"/"Good morning" now matches the Backlot wordmark's
            own typeface (font-hollywood -> Bebas Neue, see nav-bar.tsx),
            reversed from an earlier pass where the name had this treatment. */}
        <span className="font-hollywood text-4xl text-accent sm:text-5xl">{greeting}</span>{" "}
        {/* Name stays Allura cursive -- reversed back from font-hollywood
            per product direction. */}
        <span className={`${allura.className} text-5xl text-accent sm:text-6xl`}>{firstName}</span>
      </h1>
      {ratedCount ? (
        <p className="mt-1.5 text-center text-sm text-foreground-muted">Tonight&apos;s picks are tuned to your ratings.</p>
      ) : (
        <p className="mt-1.5 text-center text-sm text-foreground-muted">
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

      {/* Social rail content is identical either way -- only the top of
          the page (recommendation vs. companion picker, and where
          Director of the Day sits) differs between the two modes, so
          it's built once here and dropped into whichever layout below
          applies. */}
      {(() => {
        const socialRail = (
          <div className="border-t border-border pt-6">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-foreground-muted">Your circle</span>
              {/* Clubs used to live only in the desktop-only top nav-bar
                  list -- zero mobile discoverability, and buried as the
                  6th item in a row most people never scanned past Discover/
                  Movie Night. This IS the social/group section of the home
                  page every signed-in visit already passes through, so it's
                  a small header link here instead, same treatment as the
                  existing Hot Takes link right next to it. */}
              <div className="flex items-center gap-4">
                <Link href="/clubs" className="text-[11px] uppercase tracking-wider text-foreground-muted hover:text-accent">
                  Clubs &rarr;
                </Link>
                <Link href="/hot-takes" className="text-[11px] uppercase tracking-wider text-foreground-muted hover:text-accent">
                  Hot Takes &rarr;
                </Link>
              </div>
            </div>

            {/* Modernization pass: the movie-night quick action and the
                circle feed used to stack full-width, one under the other.
                They're independent cards with no shared internal layout,
                so a two-column bento grid on sm+ (still a simple stack on
                mobile) reads as a deliberate asymmetric card cluster
                instead of a plain list -- same content and conditionals,
                just arranged side by side. */}
            <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:items-start">
              <div>
                {activeNight ? (
                  <MovieNightCard
                    nightId={activeNight.id}
                    participants={activeNight.participants}
                    isHost={activeNight.hostId === user.id}
                  />
                ) : (
                  // Always-on entry point, not just a card that shows up
                  // once you're already in a session -- Movie Night's
                  // whole value is pulling other people in, so the prompt
                  // to *start* one needs to be visible on every visit, not
                  // conditional on already having one going.
                  <form action={createMovieNight}>
                    <button
                      type="submit"
                      className="bento-card flex w-full items-center gap-3 p-4 text-left"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                        <Clapperboard size={18} />
                      </span>
                      <span>
                        <span className="block text-sm font-medium">Start a movie night</span>
                        <span className="block text-xs text-foreground-muted">
                          Invite friends and vote on something everyone&apos;s taste agrees on
                        </span>
                      </span>
                    </button>
                  </form>
                )}
              </div>

              <div>
                {circleEvents.length > 0 ? (
                  <CircleFeed items={circleEvents} />
                ) : (
                  !activeNight && (
                    <p className="text-sm text-foreground-muted">
                      Follow a few people to see what they&apos;re watching here.
                    </p>
                  )
                )}
              </div>
            </div>
          </div>
        );

        return isCompanionContext ? (
          /* Date night / with friends: unchanged from before -- picks
             hand off entirely to CompanionPicker (no solo "hero" to
             pair Hidden Gem with), so Hidden Gem stays up top of the
             right rail alongside the social feed, same slot Director
             of the Day used to occupy here. */
          <div className="mt-7 lg:grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start lg:gap-10">
            <div>
              <CompanionPicker context={activeContext} />
            </div>
            <div className="mt-8 lg:mt-0">
              {hiddenGem && (
                <div className="mb-8">
                  <HiddenGemCard title={hiddenGem.title} matchPercent={hiddenGem.matchPercent} />
                </div>
              )}
              {socialRail}
            </div>
          </div>
        ) : (
          <div className="mt-7">
            {/* Front and center: the recommendation and Hidden Gem paired
                side by side at a matching height, rather than a compact
                poster+text card next to a narrow rail item. Ratio
                collapses to a single column when only one of the two
                exists (e.g. cold start with no taste vector yet for
                Hidden Gem, or nothing obscure-enough-and-good-enough to
                surface today). Same slot Director of the Day occupied
                before it moved to /daily. */}
            {/* The recommendation is now the unambiguous focal point of
                the page -- full column width, alone, dramatically taller
                than everything below it (see recommendation-reveal.tsx).
                It used to share a 1.6fr/1fr row with HiddenGemCard at
                matching height, which made the two compete as equal
                partners; HiddenGemCard is now a small demoted card
                directly below instead, not a rival hero. */}
            {heroRevealPicks.length > 0 && (
              <RecommendationReveal picks={heroRevealPicks} isColdStart={isColdStart} />
            )}

            {/* Everything from here down is deliberately quieter than the
                hero above: smaller text, muted borders, compact cards --
                a demoted zone, not a second row of equally-weighted
                content. */}
            {hiddenGem && (
              <div className="mt-5">
                <HiddenGemCard title={hiddenGem.title} matchPercent={hiddenGem.matchPercent} />
              </div>
            )}
            {morePicks.length > 0 && (
              <div className="mt-8">
                <MoodRow picks={morePicks} isColdStart={isColdStart} />
              </div>
            )}
            <div className="mt-8">{socialRail}</div>
          </div>
        );
      })()}

      {/* Same section either way (solo or companion context) -- it's not
          personalized at all, just a live release calendar + news pull,
          so it sits outside the IIFE above rather than being duplicated
          in both branches. Streamed in via its own Suspense boundary (see
          the comment above the removed Promise.all entries) so the four
          live trade-press RSS fetches + og:image scraping never delay the
          personalized content above it. */}
      <Suspense fallback={<IndieSpotlightSkeleton />}>
        <IndieSpotlightSection />
      </Suspense>
    </div>
  );
}
