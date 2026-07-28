import Link from "next/link";
import { Search, Sparkles, Users, Compass, User, Clapperboard, Dna, Settings, UsersRound, Mail } from "lucide-react";

const links = [
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/taste-dna", label: "Taste DNA", icon: Dna },
  { href: "/ai", label: "Ask Frame", icon: Sparkles },
  { href: "/feed", label: "Social", icon: Users },
  { href: "/movie-night", label: "Movie Night", icon: Clapperboard },
  { href: "/clubs", label: "Clubs", icon: UsersRound },
];

export function NavBar({ isAuthed, unreadMessageCount = 0 }: { isAuthed: boolean; unreadMessageCount?: number }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link
          href="/"
          className="font-hollywood text-2xl uppercase tracking-[0.08em] text-accent"
        >
          Frame
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
              className="inline-flex h-8 items-center rounded-[var(--radius-md)] bg-accent px-3 text-sm font-medium text-accent-foreground hover:brightness-110"
            >
              Log in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
