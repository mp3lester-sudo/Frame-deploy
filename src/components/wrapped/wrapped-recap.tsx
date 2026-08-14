import Image from "@/components/ui/fade-image";
import { Card } from "@/components/ui/card";
import type { WrappedResult } from "@/lib/taste-dna/wrapped";

/**
 * Shared recap card — used by both the private /wrapped page (always a
 * live computeWrapped() call) and the public /wrapped/share/[id] page
 * (a frozen snapshot). Kept presentation-only and dependency-free on
 * auth/data-fetching so the two very different page types can render
 * identically.
 */
export function WrappedRecap({
  result,
  headline,
}: {
  result: WrappedResult;
  headline: string;
}) {
  return (
    <div>
      <p className="font-display text-xs font-semibold uppercase tracking-wide text-accent">Marquee Wrapped</p>
      <h1 className="font-section-heading mt-1 text-3xl">{headline}</h1>
      <p className="font-section-body mt-3 text-lg text-foreground-muted">{result.summary}</p>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Films rated" value={String(result.totalRated)} />
        <StatTile label="Hours watched" value={String(result.totalHours)} />
        {result.topGenres[0] && <StatTile label="Top genre" value={result.topGenres[0].genre} />}
        {result.topDirector && <StatTile label="Most-watched director" value={result.topDirector.name} />}
      </div>

      {result.topArchetype && (
        <Card className="mt-8">
          <p className="text-[11px] uppercase tracking-wider text-foreground-muted">Your archetype this year</p>
          <p className="mt-1 font-display text-xl">
            {result.topArchetype.name} <span className="text-accent">{result.topArchetype.percent}%</span>
          </p>
        </Card>
      )}

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        {result.favoriteTitle && <TitleHighlight label="Your favorite" title={result.favoriteTitle} />}
        {result.hiddenGem && <TitleHighlight label="Your hidden gem" title={result.hiddenGem} />}
      </div>

      {result.topGenres.length > 0 && (
        <div className="mt-8">
          <p className="mb-2 text-[11px] uppercase tracking-wider text-foreground-muted">Genres you watched most</p>
          <div className="flex flex-wrap gap-2">
            {result.topGenres.map((g) => (
              <span
                key={g.genre}
                className="rounded-[var(--radius-full)] border border-border bg-surface px-3 py-1 text-xs"
              >
                {g.genre} &middot; {g.count}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="text-center">
      <p className="font-display text-2xl text-accent">{value}</p>
      <p className="mt-1 text-[11px] uppercase tracking-wider text-foreground-muted">{label}</p>
    </Card>
  );
}

function TitleHighlight({
  label,
  title,
}: {
  label: string;
  title: { id: string; name: string; posterUrl: string | null; score: number };
}) {
  return (
    <div className="flex gap-4">
      <div className="relative h-36 w-24 shrink-0 overflow-hidden rounded-[var(--radius-md)] bg-surface-raised">
        {title.posterUrl && <Image src={title.posterUrl} alt={title.name} fill className="object-cover" />}
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wider text-foreground-muted">{label}</p>
        <p className="mt-1 font-display text-lg">{title.name}</p>
        <p className="mt-1 text-sm text-accent">{title.score}/5</p>
      </div>
    </div>
  );
}
