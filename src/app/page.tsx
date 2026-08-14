import Link from "next/link";
import { Suspense } from "react";
import { Allura } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { getRecommendationsForUser } from "@/lib/recommendations/engine";
import { getLandingSwipeDeck } from "@/lib/actions/landing-teaser";
import { TasteTeaser } from "@/components/landing/taste-teaser";
import { getRequestGeo, type RequestGeo } from "@/lib/geo";
import { getCurrentWeather } from "@/lib/weather";
import { RecommendationReveal, type RevealPick } from "@/components/home/recommendation-reveal";
import { MoodRow } from "@/components/home/mood-row";
import { ContextCards } from "@/components/home/context-cards";
import { ContextPicker } from "@/components/home/context-picker";
import { CompanionPicker } from "@/components/home/companion-picker";
import { isCircumstantialContext, type CircumstantialContext } from "@/lib/context/circumstantial";
import { PreciseLocation } from "@/components/home/precise-location";

const allura = Allura({ subsets: ["latin"], weight: "400" });

// --- Streamed subtrees -----------------------------------------------------
// The home page used to await getRecommendationsForUser (a several-round-trip
// pgvector + diversify pipeline -- the single most expensive call anywhere in
// the app, see engine.ts) directly in the page component, which meant NOTHING
// -- not the greeting, not the day/time/location line, not the nav -- painted
// until that finished. Same root problem Discover had (see discover/page.tsx's
// SwipeDeckSection), just worse here since Home is the page everyone lands on
// first. Splitting the weather badge and the recommendation section into their
// own async components behind Suspense lets the page shell stream immediately
// and the genuinely slow parts fill in a beat later instead of blocking
// everything.

/** Weather badge only -- day/time/location render instantly in the parent
 *  since they need nothing but the geo headers, already resolved by the time
 *  this file runs. Suspense fallback is the same ContextCards call with
 *  weather=null, i.e. exactly what today's line looks like before the async
 *  weather fetch resolves -- no skeleton needed, the line just gains a
 *  weather segment a moment later. */
async function ContextCardsWithWeather({
  day,
  time,
  location,
  geo,
}: {
  day: string;
  time: string;
  location: string | null;
  geo: RequestGeo | null;
}) {
  const weather =
    geo?.latitude != null && geo?.longitude != null ? await getCurrentWeather(geo.latitude, geo.longitude) : null;
  return <ContextCards day={day} time={time} location={location} weather={weather} />;
}

/** The actual expensive path: weather (deduped via getCurrentWeather's
 *  cache() wrapper -- see weather.ts -- so this doesn't re-fetch what
 *  ContextCardsWithWeather above already triggered) plus the full
 *  recommendation engine. Everything downstream of that single await lives
 *  in here so it can be the one thing behind a skeleton instead of the whole
 *  page. */
async function HomeRecommendationsSection({
  userId,
  activeContext,
  geo,
  hour,
}: {
  userId: string;
  activeContext: CircumstantialContext;
  geo: RequestGeo | null;
  hour: number;
}) {
  const weather =
    geo?.latitude != null && geo?.longitude != null ? await getCurrentWeather(geo.latitude, geo.longitude) : null;

  const { recommendations, isColdStart } = await getRecommendationsForUser(userId, {
    // 1 hero + 6 for MoodRow ("More picks for you") + 2 held in reserve
    // purely for RecommendationReveal's "Generate another pick" cycle --
    // the reserve pair is deliberately never passed to MoodRow, so tapping
    // "generate another" on the hero can never show a poster that's
    // already visible in the rail below it.
    limit: 9,
    context: activeContext,
    weather: { weatherCode: weather?.code ?? null, tempF: weather?.tempF ?? null, hour },
  });

  const hero = recommendations[0];
  const morePicks = recommendations.slice(1, 7);
  const heroReserve = recommendations.slice(7, 9);
  const heroPool = hero ? [hero, ...heroReserve] : [];

  // Director now comes straight off each Recommendation -- engine.ts
  // already fetches title_credits for its whole candidate pool (for
  // diversify.ts's same-director check) and now joins the person's name
  // into that same query, so this used to be its own separate round trip
  // here and no longer is.
  const heroRevealPicks: RevealPick[] = heroPool.map((r) => ({
    title: r.title,
    reason: r.reason,
    detail: r.detail,
    matchPercent: r.matchPercent,
    director: r.director,
  }));

  return (
    <>
      {/* The recommendation is the unambiguous focal point of the page --
          full column width, alone, dramatically taller than everything
          below it (see recommendation-reveal.tsx). */}
      {heroRevealPicks.length > 0 && <RecommendationReveal picks={heroRevealPicks} isColdStart={isColdStart} />}

      {/* Quiet thumbnail row -- deliberately smaller and less prominent
          than the hero above it. */}
      {morePicks.length > 0 && (
        <div className="mt-8">
          <MoodRow picks={morePicks} isColdStart={isColdStart} />
        </div>
      )}
    </>
  );
}

/** Same footprint as the real content (one tall hero card + a row of
 *  thumbnails below it) so streaming the real content in doesn't cause a
 *  layout jump. */
function HomeRecommendationsSkeleton() {
  return (
    <>
      <div className="skeleton h-[420px] w-full rounded-[var(--radius-lg)] sm:h-[480px]" />
      <div className="mt-8 flex gap-3 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-40 w-28 shrink-0 rounded-[var(--radius-md)] sm:h-48 sm:w-32" />
        ))}
      </div>
    </>
  );
}

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

  // Weather used to sit right here, blocking this Promise.all (and
  // therefore the entire page) on an external API call capped at 2s (see
  // weather.ts) -- now fetched independently inside ContextCardsWithWeather
  // and HomeRecommendationsSection below, each streamed behind its own
  // Suspense boundary, deduped via getCurrentWeather's cache() wrapper so
  // it's still only ever one real Open-Meteo request per page load.
  const [{ data: profile }, { count: ratedCount }] = await Promise.all([
    supabase.from("profiles").select("username, display_name").eq("id", user.id).maybeSingle(),
    supabase.from("ratings").select("*", { count: "exact", head: true }).eq("user_id", user.id),
  ]);

  // Real time in the visitor's own timezone (from Vercel's edge geolocation).
  // Used to be computed here specifically because getRecommendationsForUser
  // needed the hour before it could be called synchronously in this same
  // function -- now that call lives inside HomeRecommendationsSection below
  // (streamed via Suspense), but zonedNow is still needed up here for the
  // greeting/day/time line, which renders as part of the immediate shell.
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

  // "Date night" and "With friends" hand off entirely to the ad-hoc
  // companion picker below (CompanionPicker) -- they need a second real
  // person's taste before any recommendation is meaningful, so the solo
  // engine (which only ever knows about this one user) isn't run for these
  // two contexts at all, saving the pgvector/weather work for a result
  // nobody would see.
  const isCompanionContext = activeContext === "date_night" || activeContext === "with_friends";

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
          {/* object-cover, not object-contain -- see the matching
              comment in onboarding-swipe.tsx for why this is safe now
              (higher-res re-sourced footage) after an earlier pass had
              to use object-contain to avoid a blurry portrait-screen
              crop. */}
          <video autoPlay muted loop playsInline className="onboarding-intro-zoom absolute inset-0 h-full w-full object-cover" style={{ filter: "grayscale(1) contrast(1.15) brightness(0.85)", objectPosition: "center 25%" }}>
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
        <Suspense fallback={<ContextCards day={day} time={time} location={location} weather={null} />}>
          <ContextCardsWithWeather day={day} time={time} location={location} geo={geo} />
        </Suspense>
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

      {isCompanionContext ? (
        <div className="mt-7">
          <CompanionPicker context={activeContext} />
        </div>
      ) : (
        <div className="mt-7">
          {/* The recommendation is the unambiguous focal point of the
              page -- full column width, alone, dramatically taller than
              everything below it (see recommendation-reveal.tsx). Movie
              Night, Hidden Gem, the circle feed, and Indie Spotlight news
              all moved off Home entirely (Movie Night already has its own
              start-a-night form at /movie-night; Hidden Gem and Indie
              Spotlight moved to /daily; the circle feed's "Clubs" link
              moved to /feed) so this page stays to exactly two things:
              today's pick, and a few more like it -- both streamed in
              together below, since they come from the same
              getRecommendationsForUser call (see HomeRecommendationsSection
              above). */}
          <Suspense fallback={<HomeRecommendationsSkeleton />}>
            <HomeRecommendationsSection userId={user.id} activeContext={activeContext} geo={geo} hour={zonedNow.getHours()} />
          </Suspense>
        </div>
      )}
    </div>
  );
}
