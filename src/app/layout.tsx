import type { Metadata } from "next";
import { Geist, Geist_Mono, Playfair_Display, Cormorant_Garamond } from "next/font/google";
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

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

// Engraved, wide-tracked small-caps serif -- the velvet-and-foil design's
// signature lettering. Reserved for the Backlot wordmark (upright, letter
// spaced) and, italic, for the greeting's first name. Everything else
// stays on --font-display (Playfair) for body/heading text.
const cormorantGaramond = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
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

  if (user) await ensureProfile(supabase, user);

  let unreadMessageCount = 0;
  if (user) {
    const { data: conversations } = await supabase
      .from("conversations")
      .select("id")
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`);
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
      className={`${geistSans.variable} ${geistMono.variable} ${playfairDisplay.variable} ${cormorantGaramond.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <NavBar isAuthed={!!user} unreadMessageCount={unreadMessageCount} unreadNotificationCount={unreadNotificationCount} />
        <main className="flex-1 pb-16 md:pb-0"><PageTransition>{children}</PageTransition></main>
        <BottomNav />
      </body>
    </html>
  );
}
