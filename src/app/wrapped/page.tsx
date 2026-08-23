import Link from "next/link";
import { redirect } from "next/navigation";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { getMyWrapped, getMyRecentWrapped } from "@/lib/actions/wrapped";
import { WrappedStory } from "@/components/wrapped/wrapped-story";
import { WrappedFullStory } from "@/components/wrapped/wrapped-full-story";
import { Button } from "@/components/ui/button";
import { PremiumUpsell } from "@/components/premium-upsell";
import { MIN_RATINGS_FOR_WRAPPED, getMonthRange, getWeekRange } from "@/lib/taste-dna/wrapped";

export default async function WrappedPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const user = await getVerifiedUser();
  if (!user) redirect("/login?next=/wrapped");

  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const { year: yearParam } = await searchParams;
  const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : currentYear;
  const isCurrentYear = year === currentYear;

  // getMyRecentWrapped is independent of the year param above -- always
  // "the current week/month" (week for Auteur, month for Premium -- see
  // getMyRecentWrapped), gated inside the action itself -- so it doesn't
  // need to wait on getMyWrapped(year) or vice versa.
  const [result, recent] = await Promise.all([getMyWrapped(year), getMyRecentWrapped()]);
  const recentLabel = recent.cadence === "week" ? getWeekRange(now).label : getMonthRange(now).label;
  const recentHeadline = recent.cadence === "week" ? `Your week of ${recentLabel}` : `Your ${recentLabel}`;

  return (
    <section className="mx-auto max-w-2xl px-4 py-10">
      {/* Recent recap -- Premium perk (task #140), Auteur gets it weekly
          instead of monthly (task #342). Sits above the yearly story
          since "this week/month" is the more immediate, frequently-
          refreshed hook. Free accounts get a one-line upsell instead of a
          locked-looking card; Premium/Auteur accounts with too few
          ratings in the period yet get the same "keep rating" framing as
          the yearly one. Rendered as its own compact WrappedStory rather
          than a plain stat grid so the whole feature -- not just the
          once-a-year headline moment -- gets the full Spotify-Wrapped
          treatment. */}
      <div className="mb-10 border-b border-border pb-8">
        <p className="text-[11px] font-medium uppercase tracking-wider text-accent">
          {recent.cadence === "week" ? "This week" : "This month"}
        </p>
        {!recent.isPremium ? (
          <div className="mt-2">
            <PremiumUpsell message="Get a fresh recap every month, not just once a year." />
          </div>
        ) : recent.result ? (
          <div className="mt-3">
            <WrappedStory result={recent.result} headline={recentHeadline} variant="compact" />
          </div>
        ) : (
          <p className="mt-2 text-sm text-foreground-muted">
            Rate at least {MIN_RATINGS_FOR_WRAPPED} titles this {recent.cadence} and your recap fills in here.
          </p>
        )}
      </div>

      <div className="mb-6 flex items-center justify-between text-sm">
        <Link href={`/wrapped?year=${year - 1}`} className="text-foreground-muted hover:text-foreground">
          &larr; {year - 1}
        </Link>
        {!isCurrentYear && (
          <Link href={`/wrapped?year=${year + 1}`} className="text-foreground-muted hover:text-foreground">
            {year + 1} &rarr;
          </Link>
        )}
      </div>

      {!result ? (
        <div className="text-center">
          <h1 className="text-gold-foil font-section-heading text-4xl">Your {isCurrentYear ? `${year} So Far` : `${year} Wrapped`}</h1>
          <p className="font-section-body mt-3 text-sm text-foreground-muted">
            Rate at least {MIN_RATINGS_FOR_WRAPPED} titles from {year} and this fills in — your recap, built from
            the same Taste Graph as the rest of Slate, not just a tally.
          </p>
          <Link href="/discover" className="mt-6 inline-block">
            <Button>Find something to rate</Button>
          </Link>
        </div>
      ) : (
        <WrappedFullStory
          result={result}
          headline={`Your ${isCurrentYear ? `${year} So Far` : `${year} Wrapped`}`}
          shareYear={year}
        />
      )}
    </section>
  );
}
