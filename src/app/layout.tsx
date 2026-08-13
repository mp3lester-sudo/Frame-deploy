import type { Metadata, Viewport } from "next";
import { siteOrigin, SITE_NAME, SITE_DESCRIPTION } from "@/lib/seo/site";
import { Geist, Geist_Mono, Instrument_Serif, Bebas_Neue, Monoton, Cinzel, Big_Shoulders, IBM_Plex_Sans, Syne } from "next/font/google";
import "./globals.css";
import { NavBar } from "@/components/layout/nav-bar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/actions/ensure-profile";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { getUnreadNotificationCount } from "@/lib/actions/notifications";
import { isPremiumActive } from "@/lib/premium/is-premium";
import { PageTransition } from "@/components/page-transition";
import { PromoBanner } from "@/components/layout/promo-banner";
import { PostHogProvider } from "@/components/analytics/posthog-provider";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker-registration";
import { ToastProvider } from "@/components/ui/toast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Minimal, luxurious display serif -- house heading font across the whole
// app (movie titles, page headers, section labels, everything that used to
// be Playfair Display via --font-display). Only ships weight 400/italic
// (no true bold cut), which is the intended look: quiet, editorial
// restraint rather than a heavy headline face.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

// Tall, condensed, bold marquee lettering -- the "HOLLYWOOD sign" look.
// Reserved for the Backlot wordmark only; everything else stays on
// --font-display (Playfair) for body/heading text.
const bebasNeue = Bebas_Neue({
  variable: "--font-bebas",
  subsets: ["latin"],
  weight: "400",
});

// Inscriptional roman serif -- reserved for profile pages themed around
// a specific favorite film's opening title-card look (see
// src/lib/profile/theme-preset.ts). Not used anywhere else in the app;
// --font-display stays on Playfair everywhere by default and only a
// themed profile's own subtree overrides it to this via inline CSS
// custom properties.
const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
});

// Glowing, double-stroke neon-tube lettering, filled with a dotted
// "row of light bulbs" texture (see .marquee-bulbs in globals.css) --
// reserved for the greeting's first name specifically.
const monoton = Monoton({
  variable: "--font-monoton",
  subsets: ["latin"],
  weight: "400",
});

// Bold condensed poster-title sans + a clean editorial-grotesque body --
// reserved for the header/small-text pair on the seven section pages
// (Discover, Backlot DNA, Wrapped, Ask Backlot, Social/Feed, Movie Night,
// Clubs), via --font-section-heading / --font-section-body in globals.css.
// Deliberately distinct from --font-display (Instrument Serif) so those
// pages read as a related but separate typographic register, not a copy
// of the home page's treatment.
const bigShouldersDisplay = Big_Shoulders({
  variable: "--font-big-shoulders-display",
  subsets: ["latin"],
  weight: ["600", "700"],
  // Google's "Big Shoulders" ships as a single variable font with named
  // instances (Display/Text/Inline/Stencil) for what used to be separate
  // families -- next/font's automatic fallback-metrics lookup keys off
  // those instance names and can't resolve the bare family, so it already
  // silently skips generating a fallback font. This just says so
  // explicitly instead of leaving a "Failed to find font override values"
  // warning on every build for a no-op. See
  // https://github.com/vercel/next.js/issues/47115.
  adjustFontFallback: false,
});

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500"],
});

// Bold, minimal geometric display -- the home page greeting's first name,
// replacing the Monoton "marquee bulbs" treatment as the default look when
// no poster-matched font is on file for this user's last title (see
// --font-greeting in globals.css and lib/poster-font).
const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["700", "800"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: {
    default: "Backlot — The Operating System for Entertainment",
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    siteName: SITE_NAME,
    type: "website",
    title: "Backlot — The Operating System for Entertainment",
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Backlot — The Operating System for Entertainment",
    description: SITE_DESCRIPTION,
  },
  robots: { index: true, follow: true },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

// themeColor/colorScheme live in a separate `viewport` export (moved out
// of `metadata` in Next 14+) -- this is what colors the mobile browser
// chrome/status bar and the PWA splash screen background. themeColor
// kept in sync with --background in globals.css (rich black, #0a0908 --
// this had drifted to the old wine-black #120708 from before that
// palette change). viewportFit: "cover" is the prerequisite for
// env(safe-area-inset-*) to resolve to real values instead of 0 in an
// iOS PWA/standalone context -- see BottomNav and the <main> padding
// below, both of which depend on it.
export const viewport: Viewport = {
  themeColor: "#0a0908",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  // Reads the user middleware already verified for this request instead of
  // calling supabase.auth.getUser() again here — this layout wraps every
  // single page, so that redundant call used to happen on every navigation
  // (and a second time after every Server Action's revalidatePath forced
  // a re-render), each one a real network round trip to Supabase's Auth
  // server. See src/lib/auth/verified-user.ts.
  const user = await getVerifiedUser();

  // ensureProfile and the conversations lookup below don't depend on each
  // other — this layout wraps every single page, so this async work re-runs
  // on every navigation across the whole app. It used to run as two
  // sequential round trips (ensureProfile, *then* conversations) before
  // even reaching the destination page's own data fetching; running them
  // concurrently shaves one full round trip off every click.
  let unreadMessageCount = 0;
  let unreadNotificationCount = 0;
  let isPremium = false;
  if (user) {
    // getUnreadNotificationCount() used to be its own separate 
    // below this block -- a full extra sequential network round trip to
    // Supabase tacked onto every single authenticated page view across the
    // whole app (this layout wraps every route), for zero benefit since it
    // doesn't depend on anything else fetched here. Folded into the same
    // batch as the fix.
    const [, { data: conversations }, { data: profile }, notificationCount] = await Promise.all([
      ensureProfile(supabase, user),
      supabase.from("conversations").select("id").or(`user_a.eq.${user.id},user_b.eq.${user.id}`),
      // Drives the house promo banner below (task #141) -- "ad-free" only
      // means something if free accounts see something to go ad-free
      // from. Cheap enough (single boolean column) to fetch unconditionally
      // alongside the other per-request lookups this layout already does.
      supabase.from("profiles").select("is_premium, bonus_premium_until").eq("id", user.id).maybeSingle(),
      getUnreadNotificationCount(),
    ]);
    unreadNotificationCount = notificationCount;
    const conversationIds = (conversations ?? []).map((c) => c.id);
    if (conversationIds.length) {
      const { count } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .in("conversation_id", conversationIds)
        .neq("sender_id", user.id)
        .is("read_at", null);
      unreadMessageCount = count ?? 0;
    }
    isPremium = isPremiumActive(profile);
  }
  // Logged-out visitors get the landing page's own conversion funnel
  // instead of a banner; Premium accounts never see it at all.
  const showPromoBanner = !!user && !isPremium;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} ${bebasNeue.variable} ${monoton.variable} ${cinzel.variable} ${bigShouldersDisplay.variable} ${ibmPlexSans.variable} ${syne.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {/* Synchronous, runs during HTML parsing before React hydrates --
            same pattern as the greeting-splash script in page.tsx. Reads
            the analytics-consent cookie/localStorage (see
            lib/analytics/consent.ts) and, if the visitor already decided,
            tags <html> so the CSS rule below (html.consent-decided
            .cookie-consent-banner) hides the banner instantly. Doing this
            in CSS rather than React state sidesteps hydration entirely --
            the banner component still renders identical markup on the
            server and the client, so there is nothing for React to
            reconcile and no mismatch that depends on timing. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try {
  var k = 'backlot_analytics_consent';
  var m = document.cookie.match(new RegExp('(?:^|;\\s*)' + k + '=([^;]*)'));
  var v = m ? decodeURIComponent(m[1]) : null;
  if (v !== 'granted' && v !== 'denied') v = window.localStorage.getItem(k);
  if (v === 'granted' || v === 'denied') {
    document.documentElement.classList.add('consent-decided');
  }
} catch (e) {}`,
          }}
        />
        <PostHogProvider userId={user?.id ?? null}>
          <ToastProvider>
            <ServiceWorkerRegistration />
            <NavBar isAuthed={!!user} unreadMessageCount={unreadMessageCount} unreadNotificationCount={unreadNotificationCount} />
            {showPromoBanner && <PromoBanner />}
            {/* pb grows by env(safe-area-inset-bottom) to match BottomNav's
                own bottom padding (see bottom-nav.tsx) -- otherwise page
                content would be hidden behind the taller bar on notched
                iPhones instead of just behind the original 64px tab row. */}
            <main className="flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0"><PageTransition>{children}</PageTransition></main>
            <BottomNav />
          </ToastProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
