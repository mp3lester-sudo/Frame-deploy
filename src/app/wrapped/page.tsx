import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { getMyWrapped } from "@/lib/actions/wrapped";
import { WrappedRecap } from "@/components/wrapped/wrapped-recap";
import { ShareWrappedButton } from "@/components/wrapped/share-button";
import { Button } from "@/components/ui/button";
import { MIN_RATINGS_FOR_WRAPPED } from "@/lib/taste-dna/wrapped";

export default async function WrappedPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const supabase = await createClient();
  const user = await getVerifiedUser();
  if (!user) redirect("/login?next=/wrapped");

  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const { year: yearParam } = await searchParams;
  const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : currentYear;
  const isCurrentYear = year === currentYear;

  const result = await getMyWrapped(year);

  return (
    <section className="mx-auto max-w-2xl px-4 py-10">
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
