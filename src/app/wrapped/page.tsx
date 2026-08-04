import Link from "next/link";
import { redirect } from "next/navigation";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { getMyWrapped, getMyMonthlyWrapped } from "@/lib/actions/wrapped";
import { WrappedRecap } from "@/components/wrapped/wrapped-recap";
import { ShareWrappedButton } from "@/components/wrapped/share-button";
import { Button } from "@/components/ui/button";
import { PremiumUpsell } from "@/components/premium-upsell";
import { MIN_RATINGS_FOR_WRAPPED, getMonthRange } from "@/lib/taste-dna/wrapped";

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

  const result = await getMyWrapped(year);
  // Independent of the year param above -- this is always "the current
  // calendar month," Premium-gated inside the action itself.
  const monthly = await getMyMonthlyWrapped();
  return (
    <section className="mx-auto max-w-2xl px-4 py-10">
      {/* Monthly recap -- Premium perk (task #140), sits above the yearly
          recap since "this month" is the more immediate, frequently-
          refreshed hook. Free accounts get a one-line upsell instead of a
          locked-looking card; Premium accounts with too few ratings this
          month yet get the same "keep rating" framing as the yearly one. */}
      <div className="mb-10 border-b border-border pb-8">
        <p className="text-[11px] font-medium uppercase tracking-wider text-accent">This month</p>
        {!monthly.isPremium ? (
          <div className="mt-2">
            <PremiumUpsell message="Get a fresh recap every month, not just once a year." />
          </div>
        ) : monthly.result ? (
          <div className="mt-3">
            <WrappedRecap result={monthly.result} headline={`Your ${getMonthRange(new Date()).label}`} />
          </div>
        ) : (
          <p className="mt-2 text-sm text-foreground-muted">
            Rate at least {MIN_RATINGS_FOR_WRAPPED} titles this month and your recap fills in here.
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
          <h1 className="font-section-heading text-3xl">Your {isCurrentYear ? `${year} So Far` : `${year} Wrapped`}</h1>
          <p className="font-section-body mt-3 text-sm text-foreground-muted">
            Rate at least {MIN_RATINGS_FOR_WRAPPED} titles from {year} and this fills in — your recap, built from
            the same Taste Graph as the rest of Backlot, not just a tally.
          </p>
          <Link href="/discover" className="mt-6 inline-block">
            <Button>Find something to rate</Button>
          </Link>
        </div>
      ) : (
        <>
          <WrappedRecap result={result} headline={`Your ${isCurrentYear ? `${year} So Far` : `${year} Wrapped`}`} />
          <div className="mt-10 border-t border-border pt-6">
            <p className="mb-3 text-[11px] uppercase tracking-wider text-foreground-muted">
              Share this recap
            </p>
            <ShareWrappedButton year={year} />
          </div>
        </>
      )}
    </section>
  );
}
