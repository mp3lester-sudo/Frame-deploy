import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif, Bebas_Neue, Monoton, Cinzel, Big_Shoulders, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { NavBar } from "@/components/layout/nav-bar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/actions/ensure-profile";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { getUnreadNotificationCount } from "@/lib/actions/notifications";
import { PageTransition } from "@/components/page-transition";

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
});

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Backlot — The Operating System for Entertainment",
  description: "Personalized movie and TV recommendations that actually get your taste.",
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
  if (user) {
    const [, { data: conversations }] = await Promise.all([
      ensureProfile(supabase, user),
      supabase.from("conversations").select("id").or(`user_a.eq.${user.id},user_b.eq.${user.id}`),
    ]);
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
  }

  const unreadNotificationCount = user ? await getUnreadNotificationCount() : 0;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} ${bebasNeue.variable} ${monoton.variable} ${cinzel.variable} ${bigShouldersDisplay.variable} ${ibmPlexSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <NavBar isAuthed={!!user} unreadMessageCount={unreadMessageCount} unreadNotificationCount={unreadNotificationCount} />
        <main className="flex-1 pb-16 md:pb-0"><PageTransition>{children}</PageTransition></main>
        <BottomNav />
      </body>
    </html>
  );
}
