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

/** Mobile-only bottom tab bar. The top NavBar carries the same destinations on desktop. */
export function BottomNav({ mediaType }: { mediaType: MediaType }) {
  const pathname = usePathname();
  const tabs = getTabs(mediaType);

  return (
    // pb adds the iOS home-indicator gutter as pure extra space below the
    // existing 64px tab row (h-16 on the inner div, unchanged) rather than
    // squeezing icons into a shorter box -- resolves to 0px anywhere
    // safe-area-inset-bottom is 0 (Android, desktop, non-notched iPhones),
    // so this is a no-op outside the cases it's meant for. Depends on
    // viewport-fit: cover being set in layout.tsx's viewport export.
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      aria-label="Primary"
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-around px-2">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2 text-[10px] uppercase tracking-wide",
                active ? "text-accent" : "text-foreground-muted"
              )}
            >
              <Icon size={20} strokeWidth={active ? 2 : 1.5} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
