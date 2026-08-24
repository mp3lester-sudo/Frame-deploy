import Image from "@/components/ui/fade-image";
import Link from "next/link";
import type { WelcomeBackData } from "@/lib/home/welcome-back";

/**
 * "While you were away" -- shown once, right at the top of Home, only for
 * accounts returning after a genuine 14+ day gap (see getWelcomeBackData).
 * Surfaces up to 3 titles from favorite directors that released *during*
 * the time away, resolved from notifications the existing cron job
 * (favorite-director-alerts.ts) already wrote -- no new query work beyond
 * what getWelcomeBackData itself does, and that call already early-exits
 * before touching notifications at all for the (vast majority) active-user
 * case. Quiet single card, not a takeover -- same bento-card language as
 * HiddenGemCard right below it on the page.
 */
export function WelcomeBackHero({ data }: { data: WelcomeBackData }) {
  return (
    <div className="bento-card mx-auto mt-5 max-w-md p-4">
      <p className="text-sm font-medium text-foreground">
        Welcome back — it&apos;s been {data.daysAway} days
      </p>
      {data.newFromFavoriteDirectors.length > 0 ? (
        <>
          <p className="mt-1 text-xs text-foreground-muted">
            From directors you follow, released while you were away
          </p>
          <div className="mt-3 flex gap-3">
            {data.newFromFavoriteDirectors.map((title) => (
              <Link
                key={title.id}
                href={`/movie/${title.id}`}
                className="w-16 shrink-0 transition-opacity hover:opacity-80"
              >
                <div className="relative aspect-[2/3] overflow-hidden rounded-[var(--radius-sm)] bg-surface-raised">
                  {title.posterUrl && (
                    <Image src={title.posterUrl} alt={title.name} fill className="object-cover" sizes="64px" />
                  )}
                </div>
                <p className="mt-1 truncate text-[11px] text-foreground-muted">{title.name}</p>
              </Link>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-1 text-xs text-foreground-muted">Here&apos;s what&apos;s new for you today</p>
      )}
    </div>
  );
}
