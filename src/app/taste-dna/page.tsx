import type { CSSProperties } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { createClient } from "@/lib/supabase/server";
import { getActiveMediaType } from "@/lib/context/media-type";
import { computeTasteDna } from "@/lib/taste-dna/compute";
import { computeSignaturePicks } from "@/lib/taste-dna/signature-pick";
import { withTimeout } from "@/lib/with-timeout";
import { SignaturePickCard } from "@/components/taste-dna/signature-pick-card";
import { Button } from "@/components/ui/button";
import { ArchetypeBar } from "@/components/taste-dna/archetype-bar";
import { MIN_SAMPLE_SIZE, PACING_LABEL } from "@/lib/taste-dna/labels";
import { isAuteurActive } from "@/lib/premium/tier";
import { getTasteTwin } from "@/lib/social/taste-twin";
import { TasteTwinCard } from "@/components/taste-dna/taste-twin-card";
import { resolveTasteTheme } from "@/lib/profile/theme-preset";

/** Free/Premium get the single headline signature pick and the original
 *  2-insight-per-direction evolution read; Auteur gets several signature
 *  picks and a fuller evolution read instead (task #343's "extended
 *  signature picks + evolution timeline" perk). */
const STANDARD_SIGNATURE_PICK_COUNT = 1;
const AUTEUR_SIGNATURE_PICK_COUNT = 5;
const AUTEUR_MAX_ARCHETYPE_INSIGHTS = 6;

export default async function TasteDnaPage() {
  const user = await getVerifiedUser();
  if (!user) redirect("/login?next=/taste-dna");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_premium, premium_tier")
    .eq("id", user.id)
    .maybeSingle();
  const isAuteur = isAuteurActive(profile);
  // "Fully separate profiles" (no movies bleeding into Shows mode and vice
  // versa) -- everything below is scoped to whichever toggle is active.
  const mediaType = await getActiveMediaType();

  // computeSignaturePicks makes several sequential DB round trips on top of
  // computeTasteDna's own queries; it's a nice-to-have section, not core to
  // the page, so a slow or stuck call there (e.g. a query queued behind DB
  // connection pressure, with no timeout of its own on the underlying
  // fetch) must never hold up the rest of the page forever. Racing it
  // against a timeout and falling back to [] (silently hiding the section)
  // guarantees this page always resolves.
  const [dna, signaturePicks, tasteTwin] = await Promise.all([
    computeTasteDna(user.id, mediaType, isAuteur ? AUTEUR_MAX_ARCHETYPE_INSIGHTS : undefined),
    withTimeout(
      computeSignaturePicks(user.id, isAuteur ? AUTEUR_SIGNATURE_PICK_COUNT : STANDARD_SIGNATURE_PICK_COUNT, mediaType),
      10000,
      []
    ),
    // Same "never hold up the page" treatment as signaturePicks above --
    // getTasteTwin's cache-miss path does several pairwise compute.ts
    // calls (bounded, but still real DB round trips), and this section is
    // a nice-to-have, not core to the page.
    withTimeout(getTasteTwin(user.id), 10000, null),
  ]);

  if (dna.sampleSize < MIN_SAMPLE_SIZE) {
    return (
      <section className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-gold-foil font-section-heading text-4xl">Your Slate DNA</h1>
        <p className="font-section-body mt-3 text-sm text-foreground-muted">
          Rate a few more titles and this fills in — nobody wants recommendations because you
          liked one movie. Slate learns the throughline: morally gray protagonists, atmospheric
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

  // Same archetype-driven palette the profile page resolves (see
  // theme-preset.ts) -- this page only has dna.archetypes/dna.sampleSize
  // on hand (no favorite_titles fetch here), so it uses the archetype
  // tier directly rather than the combined resolveTheme() the profile
  // page uses. This is genuinely the page the theme should feel most at
  // home on: it's the one place that explains *why* the palette shifted.
  const theme = resolveTasteTheme(dna.archetypes, dna.sampleSize);

  return (
    <section className="mx-auto max-w-2xl px-4 py-10" style={theme.vars as CSSProperties}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-gold-foil font-section-heading text-4xl">Your Slate DNA</h1>
          <p className="font-section-body mt-2 text-sm text-foreground-muted">
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

      {signaturePicks.length > 0 && (
        <div className="mt-8 flex flex-col gap-4">
          {signaturePicks.length > 1 && (
            <p className="text-[11px] font-medium uppercase tracking-wider text-accent">
              Your signature picks
            </p>
          )}
          {signaturePicks.map((pick) => (
            <SignaturePickCard key={pick.title.id} pick={pick} />
          ))}
        </div>
      )}

      {tasteTwin && <TasteTwinCard twin={tasteTwin} />}

      {/* Everything below used to be a run of bare pill rows directly on
          the page background -- the exact same archetype bars / genre /
          language / mood / director pills that live inside a bento-card
          panel on the profile page (see profile's inline Slate DNA
          section). Wrapping it in the same panel here closes that gap:
          this page had zero card-treatment history across the whole app
          (design audit, ranked item #4), even though it's the canonical
          home for this data and the profile page already got the glass
          treatment. */}
      <div className="bento-card mt-8 px-6 py-8 sm:px-10 sm:py-10">
      <div className="flex flex-col gap-4">
        {topArchetypes.map((a, i) => (
          <ArchetypeBar
            key={a.name}
            name={a.name}
            percent={a.percent}
            delayMs={i * 80}
            citedTitles={a.citedTitles}
            matchedKeywords={a.matchedKeywords}
          />
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

        {dna.languageBreakdown.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] uppercase tracking-wider text-foreground-muted">
              Languages
            </p>
            <div className="flex flex-wrap gap-2">
              {dna.languageBreakdown.map((l) => (
                <span
                  key={l.label}
                  className="rounded-[var(--radius-full)] border border-border bg-surface px-3 py-1 text-xs"
                >
                  {l.label} {l.percent}%
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        {dna.moodBreakdown.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] uppercase tracking-wider text-foreground-muted">
              Mood &amp; tone
            </p>
            <div className="flex flex-wrap gap-2">
              {dna.moodBreakdown.map((m) => (
                <span
                  key={m.tag}
                  className="rounded-[var(--radius-full)] border border-border bg-surface px-3 py-1 text-xs capitalize"
                >
                  {m.tag} {m.percent}%
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
      </div>

      {dna.eraDistribution.length > 0 && (
        <div className="mt-10">
          <p className="mb-2 text-[11px] uppercase tracking-wider text-foreground-muted">
            Era distribution
          </p>
          <div className="flex flex-col gap-3">
            {dna.eraDistribution.map((e, i) => (
              <ArchetypeBar key={e.decade} name={e.decade} percent={e.percent} delayMs={i * 60} />
            ))}
          </div>
        </div>
      )}

      {(dna.pacingPreference || dna.violenceTolerance != null || dna.comedyTolerance != null) && (
        <div className="mt-10">
          <p className="mb-2 text-[11px] uppercase tracking-wider text-foreground-muted">
            Sensibility
          </p>
          {/* Pill treatment matching genres/languages/mood/directors above,
              not a plain bullet list -- same fix task #844 made on the
              profile page's copy of this block. */}
          <div className="flex flex-wrap gap-2">
            {dna.pacingPreference && (
              <span className="rounded-[var(--radius-full)] border border-border bg-surface px-3 py-1 text-xs">
                {PACING_LABEL[dna.pacingPreference] ?? dna.pacingPreference}
              </span>
            )}
            {dna.violenceTolerance != null && (
              <span className="rounded-[var(--radius-full)] border border-border bg-surface px-3 py-1 text-xs">
                Violence tolerance {dna.violenceTolerance}/5
              </span>
            )}
            {dna.comedyTolerance != null && (
              <span className="rounded-[var(--radius-full)] border border-border bg-surface px-3 py-1 text-xs">
                Comedy tolerance {dna.comedyTolerance}/5
              </span>
            )}
            {dna.emotionalIntensityPreference != null && (
              <span className="rounded-[var(--radius-full)] border border-border bg-surface px-3 py-1 text-xs">
                Emotional intensity {dna.emotionalIntensityPreference}/5
              </span>
            )}
          </div>
        </div>
      )}

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
      </div>
    </section>
  );
}
