import Link from "next/link";
import { Suspense } from "react";
import { Sparkles } from "lucide-react";
import Image from "@/components/ui/fade-image";
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
import { getActiveMediaType } from "@/lib/context/media-type";
import type { MediaType } from "@/lib/context/media-type-cookie";
import { PreciseLocation } from "@/components/home/precise-location";
import { getWelcomeBackData } from "@/lib/home/welcome-back";
import { WelcomeBackHero } from "@/components/home/welcome-back-hero";
import { WatchPartyCard } from "@/components/home/watch-party-card";
import { getHiddenGemForUser } from "@/lib/recommendations/hidden-gem";
import { HiddenGemCard } from "@/components/home/hidden-gem-card";
import { computeSignaturePick } from "@/lib/taste-dna/signature-pick";
import { TasteDnaRow } from "@/components/home/taste-dna-row";
import { getFriendLovedThis } from "@/lib/social/friend-loved-this";
import { FriendLovedThisCard } from "@/components/movie/friend-loved-this-card";
import { getContinueWatching } from "@/lib/watch-sessions/actions";
import { ContinueWatchingRow } from "@/components/home/continue-watching-row";


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
  mediaType,
}: {
  userId: string;
  activeContext: CircumstantialContext;
  geo: RequestGeo | null;
  hour: number;
  mediaType: MediaType;
}) {
  // Not awaited here -- kicked off alongside the recommendation engine's
  // own independent DB work instead of blocking on it first, since
  // engine.ts doesn't actually need the resolved weather value until deep
  // inside its scoring loop (see getRecommendationsForUser's `weather`
  // param). These two used to run sequentially (weather's up-to-2s cap
  // fully paid, then the engine's own several-second worst case on top),
  // which meant a visitor with slow weather AND a slow candidate query
  // waited for both back-to-back for no reason -- they don't depend on
  // each other at all.
  const weatherPromise: Promise<Awaited<ReturnType<typeof getCurrentWeather>>> =
    geo?.latitude != null && geo?.longitude != null ? getCurrentWeather(geo.latitude, geo.longitude) : Promise.resolve(null);

  // Kicked off here, NOT after recommendations resolves below -- neither
  // one actually reads anything out of the recommendation engine's result.
  // signaturePick only needs userId/mediaType; continueWatching only needs
  // mediaType. These used to be fetched together with hiddenGem/friendLoved
  // in a Promise.all AFTER the `await getRecommendationsForUser` below,
  // which meant their latency was paid serially on top of the engine's own
  // (already the single most expensive call in the app) instead of
  // overlapping it -- on a live-timed load this was adding multiple extra
  // seconds of pure waiting for zero reason. hiddenGem and friendLoved
  // still have to wait (they need allShownIds / hero.title.id, both only
  // known once recommendations resolves), so those two stay below.
  const signaturePickPromise = computeSignaturePick(userId, mediaType);
  const continueWatchingPromise = getContinueWatching(mediaType);

  const { recommendations, isColdStart } = await getRecommendationsForUser(userId, {
    // 1 hero + 6 for MoodRow ("More picks for you") + 9 held in reserve
    // purely for RecommendationReveal's "Generate another pick" cycle --
    // the reserve pool is deliberately never passed to MoodRow, so tapping
    // "generate another" on the hero can never show a poster that's
    // already visible in the rail below it. Widened from 2 to 9 reserve
    // (3 -> 10 total cycleable picks) for beta -- more headroom before a
    // tester exhausts the "not feeling it" cycle and hits a dead end.
    limit: 16,
    context: activeContext,
    weather: weatherPromise.then((weather) => ({ weatherCode: weather?.code ?? null, tempF: weather?.tempF ?? null, hour })),
    mediaType,
  });

  const hero = recommendations[0];
  const morePicks = recommendations.slice(1, 7);
  const heroReserve = recommendations.slice(7, 16);
  const heroPool = hero ? [hero, ...heroReserve] : [];

  // Streaming-home hero CTA (Concept G) needs to know, per pick, whether
  // it's already on the watchlist -- one batched query over just the
  // hero pool's few ids (hero + 9 reserve, see comment above), not the
  // whole recommendations array, since MoodRow's cards don't show this
  // state. Runs inside this already-streamed/Suspense-gated section, so
  // it doesn't add to the page shell's own critical path.
  const heroPoolIds = heroPool.map((r) => r.title.id);
  let watchlistedIds = new Set<string>();
  if (heroPoolIds.length > 0) {
    const supabase = await createClient();
    const { data: watchlistRows } = await supabase
      .from("watchlist")
      .select("title_id")
      .eq("user_id", userId)
      .in("title_id", heroPoolIds);
    watchlistedIds = new Set((watchlistRows ?? []).map((row) => row.title_id));
  }

  // Home page redesign (rendition D) "Tonight, curated" section -- a
  // hidden gem, a taste-DNA signature pick, and (if a followed friend
  // rated tonight's hero highly) a bit of social proof to close it out.
  // All three are independent of the hero/MoodRow pool and of each
  // other, so they're fetched together rather than one-after-another;
  // each degrades to simply not rendering its row rather than a
  // fallback/placeholder when there's nothing real to show (cold-start
  // users, nobody followed yet, no match clearing the hidden-gem bar).
  const allShownIds = recommendations.map((r) => r.title.id);
  const [hiddenGem, signaturePick, friendLoved, continueWatching] = await Promise.all([
    getHiddenGemForUser(userId, mediaType, allShownIds),
    signaturePickPromise,
    hero ? getFriendLovedThis(userId, hero.title.id) : Promise.resolve(null),
    continueWatchingPromise,
  ]);

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
    initiallyOnWatchlist: watchlistedIds.has(r.title.id),
  }));

  return (
    <>
      {/* The recommendation is the unambiguous focal point of the page --
          full column width, alone, dramatically taller than everything
          below it (see recommendation-reveal.tsx). */}
      {heroRevealPicks.length > 0 && (
        <RecommendationReveal picks={heroRevealPicks} isColdStart={isColdStart} mediaType={mediaType} />
      )}

      {/* Quiet thumbnail row -- deliberately smaller and less prominent
          than the hero above it. Heading matches rendition D's mockup
          (d.png) -- an italic serif label, same register as "Continue
          watching" / "Tonight, curated" below, rather than the row
          floating with no label of its own. */}
      {morePicks.length > 0 && (
        <div className="mt-8">
          <h3 className="font-display mb-3 text-center text-lg italic">Also for tonight</h3>
          <MoodRow picks={morePicks} isColdStart={isColdStart} />
        </div>
      )}

      {/* Home page redesign (rendition D): a quiet Watch Party CTA sits
          right below "also for tonight," styled to echo the hero's own
          pill CTA so the page's two real actions -- watch, or start a
          group session -- share one button language instead of this
          reading as a lesser, passive link. */}
      <div className="mt-8">
        <WatchPartyCard mediaType={mediaType} />
      </div>

      {/* Continue watching -- only the viewer's own real in-progress
          watch_sessions row (see getContinueWatching); nothing rendered
          at all when there isn't one, same no-fabricated-state rule as
          Hidden Gem/Taste DNA/friend-loved below. */}
      {continueWatching && (
        <div className="mt-8">
          <h3 className="font-display mb-3 text-center text-lg italic">Continue watching</h3>
          <ContinueWatchingRow item={continueWatching} />
        </div>
      )}

      {/* "Tonight, curated" -- a single divided list rather than three
          stacked bento-cards, matching the mockup's plain hairline-rule
          rows (see d.png) instead of boxing each one in its own card. */}
      {(hiddenGem || signaturePick || friendLoved) && (
        <div className="mt-8">
          <h3 className="font-display mb-3 text-center text-lg italic">Tonight, curated</h3>
          <div className="divide-y divide-border">
            {hiddenGem && <HiddenGemCard title={hiddenGem.title} matchPercent={hiddenGem.matchPercent} />}
            {signaturePick && <TasteDnaRow pick={signaturePick} />}
            {friendLoved && <FriendLovedThisCard friend={friendLoved} />}
          </div>
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
            Slate learns your taste — pacing, tone, favorite directors, the things you can&apos;t stand —
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
  const mediaType = await getActiveMediaType();

  // Weather used to sit right here, blocking this Promise.all (and
  // therefore the entire page) on an external API call capped at 2s (see
  // weather.ts) -- now fetched independently inside ContextCardsWithWeather
  // and HomeRecommendationsSection below, each streamed behind its own
  // Suspense boundary, deduped via getCurrentWeather's cache() wrapper so
  // it's still only ever one real Open-Meteo request per page load.
  const [{ data: profile }, { count: ratedCount }, welcomeBack] = await Promise.all([
    supabase.from("profiles").select("username, display_name, avatar_url").eq("id", user.id).maybeSingle(),
    supabase.from("ratings").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    // Cheap for the vast majority of loads: getWelcomeBackData early-exits
    // right after its one activity_events/profiles query for anyone active
    // within the last 14 days, so this join costs one extra indexed query
    // per Home load and nothing more unless someone's actually been gone.
    getWelcomeBackData(user.id),
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
  const avatarUrl = profile?.avatar_url ?? null;

  return (
    <div className="mx-auto max-w-xl px-4 py-10 lg:max-w-6xl">
      <PreciseLocation />
      {/* Server-rendered (not a client component) so it's part of the
          very first HTML the browser paints -- a client-mounted overlay
          would only appear after JS hydrates, by which point the home
          page underneath (recommendations included) has usually already
          painted, showing the wrong thing first. This inline script runs
          synchronously as the browser parses the page, before anything
          below it paints: on a fresh-enough visit it marks the flag and
          lets the intro/splash render+animate normally; on a repeat visit
          it flags <html> so the CSS rules right below
          (html.intro-shown / html.splash-shown) hide them instantly, no
          animation, no flash.

          Used to key this off sessionStorage (cleared per browser
          session) rather than a timestamp -- worked fine in mobile
          Safari, but WKWebView (the native iOS app's WebView, see
          mobile-app/capacitor.config.ts) has a long-documented WebKit
          quirk where sessionStorage doesn't reliably clear between app
          relaunches the way it does in an actual browser tab -- it can
          persist indefinitely across a full force-quit + relaunch. Once
          that flag got set once on-device, the intro/splash could just
          never come back, no matter how many times someone actually
          reopened the app. localStorage + an explicit timestamp sidesteps
          the question of what "session" even means in WKWebView entirely:
          it replays whenever it's actually been a while (idle threshold
          below), on every platform, regardless of that engine's own
          session-storage lifetime semantics. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `try {
  var STALE_MS = 30 * 60 * 1000; // away 30+ min counts as a fresh app open
  var now = Date.now();

  var introAt = localStorage.getItem('slate:cinematic-intro-shown-at');
  if (introAt && (now - parseInt(introAt, 10)) < STALE_MS) {
    document.documentElement.classList.add('intro-shown');
  } else {
    localStorage.setItem('slate:cinematic-intro-shown-at', String(now));
    window.__introWillPlay = true;
  }

} catch (e) {}`,
        }}
      />
      {/* Vintage cinematic intro -- same public-domain footage as the
          onboarding flow's first-run sequence (see onboarding-swipe.tsx),
          now also playing at the top of every fresh Home session, not
          just right after signup. Built server-rendered, zero-client-JS
          (CSS keyframes only, gated by the html.intro-shown class the
          inline script above sets) rather than porting onboarding's
          stateful React version -- there's no Skip button here because
          this layer is pointer-events-none, so it never blocks the page
          underneath; a user can start scrolling/tapping immediately if
          they don't want to wait. The intro-shown flag is shared with
          onboarding's own key, so a just-signed-up user redirected here
          doesn't see the same footage twice in a row. (There used to be
          a full-screen greeting splash that played right after this and
          shared the same gating -- removed per product direction; the
          quiet initial mark near the top of the page, further down this
          file, replaced it with no animation of its own.)

          Wrapped in a tap-zone div (id below) so a tap/click anywhere
          dismisses the whole intro instantly instead of waiting out the
          fade -- the plain <script> right after registers the one
          listener needed for that, same zero-framework approach as the
          localStorage script above (no client component needed just
          for this). The video/title layers themselves stay
          pointer-events-none so the tap-zone (not them) is what's
          actually clickable. */}
      <div id="cinematic-intro-tapzone" className="fixed inset-0 z-[60] cursor-pointer">
        <div className="cinematic-intro-video pointer-events-none absolute inset-0 z-[2] overflow-hidden bg-black" aria-hidden="true">
          {/* object-cover, not object-contain -- the source clip is
              already high-resolution enough (see the matching comment in
              onboarding-swipe.tsx) that a full-bleed crop stays sharp,
              after an earlier pass on a different clip had to use
              object-contain to avoid a blurry portrait-screen crop. */}
          {/* No autoPlay/<source> in the initial markup, and preload="none"
              on top of that -- a <video autoPlay> element starts the
              browser's resource-fetch algorithm the instant it's parsed,
              completely independent of the html.intro-shown CSS class
              that (later) sets display:none on its container. Before this
              fix, that meant every single Home page load fetched this
              video in full, even on the ~29 of every 30 minutes the
              intro isn't actually going to play. The tap-zone script
              right below now sets .src and calls .play() itself, but
              only when window.__introWillPlay was actually set above --
              so the browser only ever fetches this at all on a genuine
              fresh-session load. */}
          <video id="cinematic-intro-video-el" muted loop playsInline preload="none" className="onboarding-intro-zoom absolute inset-0 h-full w-full object-cover" style={{ filter: "grayscale(1) contrast(1.15) brightness(0.85)", objectPosition: "center center" }} />
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.85) 100%)" }} />
          <div className="onboarding-intro-grain absolute inset-0" />
        </div>
        <div className="cinematic-intro-title pointer-events-none absolute inset-0 z-[1] flex flex-col items-center justify-center overflow-hidden bg-[#0A0A09]" aria-hidden="true">
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, rgba(255,250,235,0.09) 0%, transparent 60%)" }} />
          <div className="onboarding-intro-grain absolute inset-0" />
          <p className="text-gold-foil font-hollywood relative text-5xl tracking-[0.3em]">Slate</p>
          <div className="relative my-4 h-px w-16 bg-white/40" />
          <p className="font-display relative text-sm italic text-white/60">a picture house, for your taste</p>
        </div>
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `try {
  var tz = document.getElementById('cinematic-intro-tapzone');
  function dismissIntro() {
    if (document.documentElement.classList.contains('cinematic-intro-dismissed')) return;
    document.documentElement.classList.add('cinematic-intro-dismissed');
  }
  if (tz) {
    tz.addEventListener('click', function (e) {
      dismissIntro();
      // The tapzone is a full-screen fixed layer (z-60) sitting on top of
      // the entire page -- including things like the home hero's "tap for
      // tonight's pick" button, which can be visible and painted well
      // before this ~17s intro finishes. Without this, someone who taps
      // the hero *during* that window gets nothing: this listener eats
      // the tap (correctly dismissing the intro) but the hero itself
      // never hears about it, so it just sits there looking tappable and
      // doing nothing -- reading as "the page needs a refresh before it
      // works," which is exactly what a refresh appeared to fix (a
      // reload within the same 30-minute window skips the intro/tapzone
      // entirely, so the *second* tap -- now with no tapzone in the way
      // -- was really the first one that ever reached the button).
      // elementFromPoint is called *after* the dismissed class is added
      // above, which forces a synchronous style recalc, so it correctly
      // resolves to whatever is now the topmost element at that point
      // (the tapzone itself is already display:none by then) instead of
      // finding itself again.
      var x = e.clientX, y = e.clientY;
      var target = document.elementFromPoint(x, y);
      if (target && target !== tz && typeof target.click === 'function') {
        target.click();
      }
    }, { once: true });
    // Safety net for the DEFAULT path (nobody taps -- the clip just plays
    // out, per task #626 "let the video play out the whole video"). The
    // CSS-only fade (globals.css) only ever animates the two INNER layers'
    // opacity to 0; nothing ever disabled this OUTER tapzone once that
    // animation ends, so letting the intro play out naturally (the
    // documented default) left an invisible, full-viewport,
    // pointer-events:auto div sitting at z-60 forever afterward --
    // silently eating every click on the entire app (the hero's
    // tap-to-reveal, nav links, everything) until a reload happened to
    // land outside the 30-minute replay window. This timer is the actual
    // fix: it force-dismisses the tapzone (same class the click handler
    // above uses) once the video (16100ms) + title (15900ms delay +
    // 1500ms) sequence is guaranteed finished, so the common case --
    // let it play, tap nothing -- is no longer the one path with zero
    // cleanup.
    window.setTimeout(dismissIntro, 17600);
  }
  if (window.__introWillPlay) {
    var v = document.getElementById('cinematic-intro-video-el');
    if (v) {
      var s = document.createElement('source');
      s.src = '/videos/onboarding-intro.mp4';
      s.type = 'video/mp4';
      v.appendChild(s);
      v.load();
      v.play().catch(function () {});
    }
  }
} catch (e) {}`,
        }}
      />
      {/* Slate wordmark removed from this header per request -- it
          already lives in the nav bar above, so repeating it here was
          redundant. The day/time/location/weather line now centers on
          its own at the top of the page instead of trailing a title. */}
      <div className="flex justify-center">
        <Suspense fallback={<ContextCards day={day} time={time} location={location} weather={null} />}>
          <ContextCardsWithWeather day={day} time={time} location={location} geo={geo} />
        </Suspense>
      </div>

      {/* Quiet mark, "marquee nameplate" (design rendition round 2,
          option A) -- the plain floating circle from Concept C read as
          filler: no border language tying it to anything else on the
          page, no reason for it to be there beyond "here's a photo."
          This treatment borrows a director's-chair nameback: the photo
          sits in a small gold-edged plaque (not a bare circle) with the
          first name in italic serif beneath it, so it reads as a
          deliberate "this is your seat" marker instead of a stray
          avatar. Still the same photo-with-initial-fallback logic as
          before, just reframed -- no new data dependency. */}
      <div className="mt-5 flex flex-col items-center gap-1.5">
        <div className="rounded-[var(--radius-md)] border border-border-strong bg-accent/[0.03] p-[5px]">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt=""
              width={52}
              height={52}
              className="h-[52px] w-[52px] rounded-[var(--radius-sm)] object-cover"
              aria-hidden="true"
            />
          ) : (
            <span
              className="flex h-[52px] w-[52px] items-center justify-center rounded-[var(--radius-sm)] font-display text-xl italic text-accent"
              aria-hidden="true"
            >
              {firstName.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <span className="font-display text-sm italic text-foreground-muted" aria-hidden="true">
          {firstName}
        </span>
        <span className="sr-only">{firstName}&apos;s home</span>
      </div>

      {welcomeBack && <WelcomeBackHero data={welcomeBack} />}
      {/* Home header declutter pass: dropped the ratedCount-true branch
          ("Tonight's picks are tuned to your ratings") entirely -- it told
          the user nothing the page itself doesn't already show just by
          having personalized picks below it, pure filler taking up a full
          line under an already-busy header (ContextCards + greeting +
          ContextPicker all stacked above it). The ratedCount-false branch
          stays -- unlike the other one, it's a real, actionable nudge for
          someone who hasn't rated enough yet, not just restating what's
          already visible.

          UX audit finding #3: this used to be one small muted-gray line
          of text sandwiched between the greeting and the context picker
          -- on a phone screen, competing with the hero reveal and MoodRow
          right below it, it was easy to scroll straight past without
          reading. Recommendations ARE the app's entire value
          proposition, so a first-time visitor whose picks are still
          generic deserves an actual card explaining why, not a footnote.
          Upgraded to a bordered/accent-tinted card (Sparkles glyph +
          two-line copy) and points straight at /onboarding -- the real
          swipe deck -- instead of /taste-dna, which for a sub-threshold
          account just immediately shows its own "rate a few more" card
          with a second link to /onboarding anyway (see taste-dna/page.tsx)
          -- skipping that extra hop. */}
      {!ratedCount && (
        <Link
          href="/onboarding"
          className="mx-auto mt-4 flex max-w-md items-center gap-3 rounded-[var(--radius-md)] border border-accent/30 bg-accent/10 px-4 py-3 text-left transition-colors hover:border-accent/50 hover:bg-accent/15"
        >
          <Sparkles className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
          <span className="flex-1">
            <span className="block text-sm font-medium text-foreground">These picks are still a guess</span>
            <span className="block text-xs text-foreground-muted">Rate a few titles to sharpen them — takes under a minute</span>
          </span>
        </Link>
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
            <HomeRecommendationsSection
              userId={user.id}
              activeContext={activeContext}
              geo={geo}
              hour={zonedNow.getHours()}
              mediaType={mediaType}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}
