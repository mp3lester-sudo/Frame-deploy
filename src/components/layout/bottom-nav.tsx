"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Compass, Sparkles, Clapperboard, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
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
 * concept 3 of the bottom-nav mockups, flush variant). Only the active
 * tab carries a text label, expanding to make room for it, so the row
 * reads cleanly without five permanent labels competing for a ~360px
 * width. Unlike the first pass, the bar itself is NOT detached/floating
 * -- it sits flush against the true bottom edge with its own background
 * filling the safe-area gutter, so nothing (page content or bare
 * background) is ever visible below it, same guarantee the original
 * flush bar gave.
 */
export function BottomNav({
  mediaType,
  avatarUrl,
  avatarName,
}: {
  mediaType: MediaType;
  // Real profile photo for the logged-in user -- when present, the
  // Profile tab shows it instead of the generic person glyph so the bar
  // itself doubles as a reminder of whose account you're in, same as
  // most apps that put your face on your own tab. `avatarName` drives
  // the Avatar component's initials fallback when there's no photo on
  // file, so it's required whenever avatarUrl might be set (and safe to
  // omit entirely for logged-out visitors, who just get the User icon).
  avatarUrl?: string | null;
  avatarName?: string;
}) {
  const pathname = usePathname();
  const tabs = getTabs(mediaType);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-glass-border bg-glass pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      aria-label="Primary"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-1 p-1.5">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          const isProfileTab = href === "/profile/me";
          const showAvatar = isProfileTab && !!avatarName;
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
              {showAvatar ? (
                <Avatar
                  src={avatarUrl}
                  name={avatarName!}
                  size={active ? 22 : 20}
                  className={cn(
                    "shrink-0 ring-1 transition-all duration-200",
                    active ? "ring-accent-soft" : "ring-border-strong opacity-80"
                  )}
                />
              ) : (
                <Icon size={20} strokeWidth={active ? 2 : 1.5} className="shrink-0" />
              )}
              {active && <span className="text-xs font-semibold tracking-wide">{label}</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
