"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Search, Sparkles, Users, Compass, User, Clapperboard, Settings, Mail, Bell, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { getNavBadgeCounts } from "@/lib/actions/nav-badges";

// How often to re-poll unread badge counts once mounted. Not tied to
// navigation anymore (see below) -- this alone keeps them reasonably
// fresh (a new DM or notification shows up within a minute) without
// putting a DB round trip back on the critical path of every click.
const BADGE_POLL_MS = 60_000;

/** How long the nav bar stays visible with no scroll/mouse/touch/key
    activity before it slides away. Long enough that a person reading a
    long description doesn't get it yanked away mid-thought, short enough
    that it actually reclaims screen space rather than always sitting
    there like an ordinary sticky header. */
const IDLE_HIDE_MS = 4000;

// Backlot DNA no longer gets its own persistent nav entry -- it now
// lives inline on the profile page (see profile/[username]/page.tsx),
// which people already visit far more often than a standalone page.
// The route itself (/taste-dna) is untouched and still linked from the
// home page's cold-start "sharpen these picks" prompt.
// Wrapped moved the same way -- it's now a link from the profile page's
// own action list (alongside Watchlist/Your lists) rather than a
// persistent top-level tab, since it's a once-in-a-while personal recap,
// not something anyone needs one tap away from every page.
// Clubs moved the same way again -- it was the 6th item here with zero
// mobile presence at all (this row is desktop-only), so it's now a
// header link in the home page's "Your circle" social rail instead,
// right next to Hot Takes -- visible to every signed-in visit on every
// screen size, not just desktop viewers who happened to look at this row.
// Movie Night leads (right after Discover) rather than sitting fifth of
// six equal-weight tabs -- see the home page and bottom nav for the same
// promotion. Recommendations don't need a nav entry of their own: they
// already own the home page, the first thing anyone sees.
const links = [
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/movie-night", label: "Movie Night", icon: Clapperboard },
  { href: "/ai", label: "Ask Backlot", icon: Sparkles },
  { href: "/feed", label: "Social", icon: Users },
  { href: "/daily", label: "Daily", icon: CalendarDays },
];

export function NavBar({ isAuthed }: { isAuthed: boolean }) {
  const [hidden, setHidden] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Badge counts are fetched client-side, after the page has already
  // painted, instead of being awaited server-side in the root layout that
  // wraps every route (see src/lib/actions/nav-badges.ts for why) --
  // badges pop in a beat after first paint rather than gating every
  // single navigation in the app behind a couple of extra DB round trips.
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

  useEffect(() => {
    if (!isAuthed) return;
    let cancelled = false;
    async function refresh() {
      const counts = await getNavBadgeCounts().catch(() => null);
      if (!cancelled && counts) {
        setUnreadMessageCount(counts.unreadMessageCount);
        setUnreadNotificationCount(counts.unreadNotificationCount);
      }
    }
    refresh();
    const interval = setInterval(refresh, BADGE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isAuthed]);

  useEffect(() => {
    function wake() {
      setHidden(false);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => setHidden(true), IDLE_HIDE_MS);
    }

    // Start hidden-after-idle from first paint, not just after the first
    // interaction — a page nobody touches should still tuck the nav away.
    wake();

    // scroll/touchmove are passive since we never preventDefault; that
    // keeps this listener from adding scroll-jank on any page.
    const events: Array<[string, AddEventListenerOptions?]> = [
      ["scroll", { passive: true }],
      ["mousemove", { passive: true }],
      ["touchstart", { passive: true }],
      ["touchmove", { passive: true }],
      ["keydown"],
      ["click"],
    ];
    for (const [event, opts] of events) window.addEventListener(event, wake, opts);
    return () => {
      for (const [event] of events) window.removeEventListener(event, wake);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, []);

  return (
    <header
      className={cn(
        // Modernization pass: the header itself is now a transparent
        // strip (no more solid bg-background/90 + border-b) -- the glass
        // look lives on the floating pill inside it instead, so page
        // content scrolling underneath is visible through the gap around
        // the pill, not just blurred behind a full-width bar.
        "nav-bar-header sticky top-0 z-40 px-3 pt-3 transition-transform duration-300 ease-in-out",
        hidden ? "-translate-y-full" : "translate-y-0"
      )}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between rounded-full border border-glass-border bg-glass px-5 shadow-[var(--glass-shadow)] backdrop-blur-xl">
        <Link
          href="/"
          className="text-gold-foil font-hollywood text-2xl uppercase tracking-[0.08em]"
        >
          Backlot
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground"
            >
              <Icon size={16} />
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/search" aria-label="Search" className="text-foreground-muted hover:text-foreground">
            <Search size={18} />
          </Link>
          {isAuthed ? (
            <>
              <Link href="/notifications" aria-label="Notifications" className="relative text-foreground-muted hover:text-foreground">
                <Bell size={18} />
                {unreadNotificationCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-0.5 text-[9px] font-medium text-accent-foreground">
                    {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
                  </span>
                )}
              </Link>
              <Link href="/messages" aria-label="Messages" className="relative text-foreground-muted hover:text-foreground">
                <Mail size={18} />
                {unreadMessageCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-0.5 text-[9px] font-medium text-accent-foreground">
                    {unreadMessageCount > 9 ? "9+" : unreadMessageCount}
                  </span>
                )}
              </Link>
              <Link href="/settings" aria-label="Settings" className="text-foreground-muted hover:text-foreground">
                <Settings size={18} />
              </Link>
              <Link href="/profile/me" aria-label="Profile" className="text-foreground-muted hover:text-foreground">
                <User size={18} />
              </Link>
            </>
          ) : (
            <Link
              href="/login"
              className="inline-flex h-8 items-center rounded-[var(--radius-md)] bg-gold-foil px-3 text-sm font-medium text-accent-foreground shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_8px_20px_-8px_rgba(205,166,70,0.55)] hover:brightness-110"
            >
              Log in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
