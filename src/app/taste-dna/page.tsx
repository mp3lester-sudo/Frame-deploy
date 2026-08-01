import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { computeTasteDna } from "@/lib/taste-dna/compute";
import { Button } from "@/components/ui/button";
import { ArchetypeBar } from "@/components/taste-dna/archetype-bar";

const MIN_SAMPLE_SIZE = 3;

const PACING_LABEL: Record<string, string> = {
  slow: "You favor slow, deliberate pacing",
  moderate: "You favor a moderate, balanced pace",
  fast: "You favor fast, propulsive pacing",
};

export default async function TasteDnaPage() {
  const supabase = await createClient();
  const user = await getVerifiedUser();
  if (!user) redirect("/login?next=/taste-dna");

  const dna = await computeTasteDna(user.id);

  if (dna.sampleSize < MIN_SAMPLE_SIZE) {
    return (
      <section className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="font-display text-3xl">Your Backlot DNA</h1>
        <p className="mt-3 text-sm text-foreground-muted">
          Rate a few more titles and this fills in — nobody wants recommendations because you
          liked one movie. Backlot learns the throughline: morally gray protagonists, atmospheric
          tension, slow burns, whatever it turns out to be.
        </p>
        <p className="mt-2 text-xs uppercase tracking-wider text-foreground-muted">
          {dna.sampleSize} of {MIN_SAMPLE_SIZE} rated so far
        </p>
        <Link href="/onboarding" className="mt-6 inline-block">
          <Button>Rate a few titles</Button>
        </Link>
      </section>
    );
  }

  const topArchetypes = dna.archetypes.slice(0, 8);
  const hasEnrichedData = dna.enrichedSampleSize > 0;

  return (
    <section className="mx-auto max-w-2xl px-4 py-10">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">Your Backlot DNA</h1>
          <p className="mt-2 text-sm text-foreground-muted">
            Based on {dna.sampleSize} rated title{dna.sampleSize === 1 ? "" : "s"}
            {hasEnrichedData
              ? ` (${dna.enrichedSampleSize} with full AI tagging)`
              : " — tone and mood dimensions unlock once your ratings include AI-tagged titles"}
            .
          </p>
        </div>
        <Link
          href="/wrapped"
          className="hidden shrink-0 whitespace-nowrap rounded-[var(--radius-full)] border border-accent/40 px-3 py-1.5 text-xs text-accent hover:bg-accent/10 sm:block"
        >
          See your Wrapped &rarr;
        </Link>
      </div>

      <div className="mt-8 flex flex-col gap-4">
        {topArchetypes.map((a, i) => (
          <ArchetypeBar key={a.name} name={a.name} percent={a.percent} delayMs={i * 80} />
        ))}
      </div>

      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        {dna.favoriteGenres.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] uppercase tracking-wider text-foreground-muted">
              Favorite genres
            </p>
            <div className="flex flex-wrap gap-2">
              {dna.favoriteGenres.map((g) => (
                <span
                  key={g}
                  className="rounded-[var(--radius-full)] border border-border bg-surface px-3 py-1 text-xs"
                >
                  {g}
                </span>
              ))}
            </div>
          </div>
        )}

        {dna.favoriteDecades.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] uppercase tracking-wider text-foreground-muted">
              Favorite decades
            </p>
            <div className="flex flex-wrap gap-2">
              {dna.favoriteDecades.map((d) => (
                <span
                  key={d}
                  className="rounded-[var(--radius-full)] border border-border bg-surface px-3 py-1 text-xs"
                >
                  {d}
                </span>
              ))}
            </div>
          </div>
        )}

        {dna.favoriteDirectors.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] uppercase tracking-wider text-foreground-muted">
              Favorite directors
            </p>
            <div className="flex flex-wrap gap-2">
              {dna.favoriteDirectors.map((d) => (
                <span
                  key={d.id}
                  className="rounded-[var(--radius-full)] border border-border bg-surface px-3 py-1 text-xs"
                >
                  {d.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {(dna.pacingPreference || dna.violenceTolerance != null || dna.comedyTolerance != null) && (
          <div>
            <p className="mb-2 text-[11px] uppercase tracking-wider text-foreground-muted">
              Sensibility
            </p>
            <ul className="flex flex-col gap-1 text-sm text-foreground-muted">
              {dna.pacingPreference && <li>{PACING_LABEL[dna.pacingPreference] ?? dna.pacingPreference}</li>}
              {dna.violenceTolerance != null && <li>Violence tolerance: {dna.violenceTolerance}/5</li>}
              {dna.comedyTolerance != null && <li>Comedy tolerance: {dna.comedyTolerance}/5</li>}
              {dna.emotionalIntensityPreference != null && (
                <li>Emotional intensity: {dna.emotionalIntensityPreference}/5</li>
              )}
            </ul>
          </div>
        )}
      </div>

      {/* Omitted entirely (not a "not enough data yet" placeholder) when
          there isn't enough rating history to say anything real about
          change over time — see evolution.ts's thresholds. */}
      {dna.evolution && dna.evolution.insights.length > 0 && (
        <div className="mt-10 border-t border-border pt-6">
          <p className="mb-2 text-[11px] uppercase tracking-wider text-foreground-muted">
            How your taste is evolving
          </p>
          <ul className="flex flex-col gap-2 text-sm text-foreground-muted">
            {dna.evolution.insights.map((insight) => (
              <li key={insight}>{insight}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
