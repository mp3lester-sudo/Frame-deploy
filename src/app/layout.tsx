import type { Metadata, Viewport } from "next";
import { siteOrigin, SITE_NAME, SITE_DESCRIPTION } from "@/lib/seo/site";
import { Geist, Geist_Mono, Instrument_Serif, Bebas_Neue, Cinzel } from "next/font/google";
import "./globals.css";
import { NavBar } from "@/components/layout/nav-bar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { createClient } from "@/lib/supabase/server";
import { createMissingProfile } from "@/lib/actions/ensure-profile";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { isPremiumActive } from "@/lib/premium/is-premium";
import { PageTransition } from "@/components/page-transition";
import { PromoBanner } from "@/components/layout/promo-banner";
import { PremiumPopup } from "@/components/premium/premium-popup";
import { PostHogProvider } from "@/components/analytics/posthog-provider";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker-registration";
import { ToastProvider } from "@/components/ui/toast";
import { PullToRefresh } from "@/components/native/pull-to-refresh";
import { SwipeBackGesture } from "@/components/native/swipe-back-gesture";
import { WidgetTokenBootstrap } from "@/components/native/widget-token-bootstrap";
import { getActiveMediaType } from "@/lib/context/media-type";

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
// Reserved for the Slate wordmark only; everything else stays on
// --font-display (Playfair) for body/heading text.
const bebasNeue = Bebas_Neue({
  variable: "--font-bebas",
  subsets: ["latin"],
  weight: "400",
  // Only ever renders in the nav wordmark (a handful of characters) --
  // unlike Geist/Instrument Serif, which cover most of the visible text
  // on every page, next/font's default preload: true was putting a
  // <link rel="preload"> for this font's file in <head> on every single
  // page load site-wide, most of which never render a single Bebas
  // Neue glyph. Disabling preload keeps this font self-hosted and
  // still fast on the pages that do use it (it's cached after the
  // first fetch, and font-display: swap already avoids blocking text
  // paint) without paying that request/priority-hint cost everywhere
  // else.
  preload: false,
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
  // Same reasoning as bebasNeue's preload: false above -- Cinzel is
  // scoped to profile pages themed around a specific favorite film's
  // opening title-card look (theme-preset.ts) and renders nowhere else,
  // so preloading it on every page (the next/font default) was pure
  // waste for every page view that isn't a themed profile.
  preload: false,
});

// Big Shoulders + IBM Plex Sans used to be loaded here for
// --font-section-heading / --font-section-body (the seven section
// pages' own typographic register). Full design-system rollout folded
// those tokens onto --font-display / --font-sans instead (see
// globals.css) so this pair is no longer referenced anywhere -- removed
// rather than left as dead weight on every page load.

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: {
    default: "Slate — The Operating System for Entertainment",
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    siteName: SITE_NAME,
    type: "website",
    title: "Slate — The Operating System for Entertainment",
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Slate — The Operating System for Entertainment",
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
  const mediaType = await getActiveMediaType();

  // Unread message/notification badge counts are deliberately NOT fetched
  // here anymore -- this layout wraps every single page, so awaiting them
  // used to mean every navigation across the whole app (even to pages with
  // nothing to do with messages or notifications) paid 2-3 extra sequential
  // DB round trips before any content could render. NavBar now fetches its
  // own badge counts client-side after mount (see getNavBadgeCounts in
  // src/lib/actions/nav-badges.ts) -- badges pop in a beat later instead of
  // gating the entire page behind them.
  let isPremium = false;
  // avatarUrl/avatarName feed BottomNav's Profile tab (task #589) -- pulled
  // off this same query rather than a second round trip, same reasoning as
  // the is_premium fetch below.
  let avatarUrl: string | null = null;
  let avatarName: string | undefined;
  if (user) {
    // Drives the house promo banner below (task #141) -- "ad-free" only
    // means something if free accounts see something to go ad-free from.
    // Cheap enough (single boolean column) to fetch unconditionally
    // alongside the other per-request lookups this layout already does.
    //
    // This used to run in Promise.all alongside ensureProfile(), which did
    // its OWN `select id from profiles where id = user.id` first to decide
    // whether to create a row -- an identical-shape second query to the
    // same table on every single authenticated page view, for a check
    // this select already answers (no row back = doesn't exist yet).
    // Running them in parallel hid the extra latency, but it was still a
    // second real round trip to Supabase on every navigation, for the
    // ~everyone-after-their-first-request case where a profile obviously
    // already exists. Now the self-healing insert only runs on the rare
    // path where this select actually comes back empty.
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_premium, bonus_premium_until, avatar_url, display_name, username")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile) {
      await createMissingProfile(supabase, user);
    } else {
      isPremium = isPremiumActive(profile);
      avatarUrl = profile.avatar_url ?? null;
      avatarName = profile.display_name || profile.username || undefined;
    }
  }
  // Logged-out visitors get the landing page's own conversion funnel
  // instead of a banner; Premium accounts never see it at all. Also
  // gates PremiumPopup below -- same audience, same reasoning.
  const showPromoBanner = !!user && !isPremium;

  return (
    <html
      lang="en"
      data-media={mediaType}
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} ${bebasNeue.variable} ${cinzel.variable} h-full antialiased`}
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
  var k = 'slate_analytics_consent';
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
            <WidgetTokenBootstrap isAuthed={!!user} />
            {/* SwipeBackGesture (edge-swipe-back, see its own comment)
                wraps PullToRefresh rather than the other way around --
                both apply their own transform to their own wrapper div
                (translateX vs translateY), so nesting either order
                composes fine visually; this order just keeps "leaving
                this screen" (horizontal) as the outer, coarser gesture
                and "refreshing this screen" (vertical) as the inner one.
                PullToRefresh now wraps the header + page content as one
                dragged sheet (see its own comment for why) -- BottomNav is
                deliberately left outside both so the bottom tab bar stays
                pinned to the true viewport edge instead of sliding with
                the rest of the page mid-gesture. */}
            <SwipeBackGesture>
              <PullToRefresh>
                <NavBar isAuthed={!!user} mediaType={mediaType} />
                {showPromoBanner && <PromoBanner />}
                {showPromoBanner && <PremiumPopup />}
                {/* pb grows by env(safe-area-inset-bottom) to match BottomNav's
                    own bottom padding (see bottom-nav.tsx) -- otherwise page
                    content would be hidden behind the bar on notched iPhones.
                    3.5rem covers the flush bar's own height (~56px). */}
                <main className="flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0"><PageTransition>{children}</PageTransition></main>
              </PullToRefresh>
            </SwipeBackGesture>
            <BottomNav mediaType={mediaType} avatarUrl={avatarUrl} avatarName={avatarName} />
          </ToastProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
