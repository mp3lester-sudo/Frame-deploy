"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Search, Sparkles, Users, Compass, User, Clapperboard, Settings, UsersRound, Mail, Gift, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

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
const links = [
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/wrapped", label: "Wrapped", icon: Gift },
  { href: "/ai", label: "Ask Backlot", icon: Sparkles },
  { href: "/feed", label: "Social", icon: Users },
  { href: "/movie-night", label: "Movie Night", icon: Clapperboard },
  { href: "/clubs", label: "Clubs", icon: UsersRound },
];

export function NavBar({
  isAuthed,
  unreadMessageCount = 0,
  unreadNotificationCount = 0,
}: {
  isAuthed: boolean;
  unreadMessageCount?: number;
  unreadNotificationCount?: number;
}) {
  const [hidden, setHidden] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        "sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur transition-transform duration-300 ease-in-out",
        hidden ? "-translate-y-full" : "translate-y-0"
      )}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
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
