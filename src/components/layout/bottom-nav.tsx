"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Compass, Sparkles, Clapperboard, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MediaType } from "@/lib/context/media-type-cookie";
import { movieNightLabel } from "@/lib/copy/movie-night-copy";

// Movie Night replaces Social here -- this bar is the primary navigation
// surface for most people (mobile web and the native app both), and
// Movie Night previously had no presence on it at all, reachable only via
// the desktop-only top nav or a home-page card that only appeared once
// you already had a session going. Social (the Feed) is still one tap
// away from Home's "Your circle" rail, just no longer a dedicated tab.
function getTabs(mediaType: MediaType) {
  return [
    { href: "/", label: "Home", icon: Home },
    { href: "/discover", label: "Discover", icon: Compass },
    { href: "/movie-night", label: movieNightLabel(mediaType), icon: Clapperboard },
    { href: "/ai", label: "AI", icon: Sparkles },
    { href: "/profile/me", label: "Profile", icon: User },
  ];
}

/**
 * Mobile-only bottom tab bar (design round 5, "expanding label pill" --
 * concept 3 of the bottom-nav mockups). A glass pill that floats clear of
 * the screen edge instead of a flush full-width bar; only the active tab
 * carries a text label, expanding to make room for it, so the row reads
 * cleanly without five permanent labels competing for a ~360px width.
 */
export function BottomNav({ mediaType }: { mediaType: MediaType }) {
  const pathname = usePathname();
  const tabs = getTabs(mediaType);

  return (
    // The floating pill sits inside a full-width, transparent nav strip so
    // the iOS home-indicator safe-area gutter still reserves real space
    // below it (same purpose the old flush bar's env() padding served).
    <nav
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] md:hidden"
      aria-label="Primary"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-1 rounded-full border border-glass-border bg-glass p-1.5 shadow-[var(--glass-shadow)] backdrop-blur-xl">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-11 items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-full transition-all duration-200",
                active
                  ? "flex-[2.2] border border-border-strong bg-surface-raised px-4 text-accent-soft"
                  : "flex-1 px-2 text-foreground-muted"
              )}
            >
              <Icon size={20} strokeWidth={active ? 2 : 1.5} className="shrink-0" />
              {active && <span className="text-xs font-semibold tracking-wide">{label}</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
