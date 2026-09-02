import Link from "next/link";
import type { SignaturePick } from "@/lib/taste-dna/signature-pick";

/**
 * Quiet row version of the Taste DNA signature pick (see
 * signature-pick-card.tsx for the full-size version used on /taste-dna
 * and the profile page) -- a small percentage ring standing in for the
 * usual poster thumbnail, matching HiddenGemCard's footprint so the two
 * sit as an even pair inside Home's "Tonight, curated" section. Same
 * conic-gradient ring technique as the Wrapped recap's stat rings (see
 * wrapped-story.tsx).
 */
export function TasteDnaRow({ pick }: { pick: SignaturePick }) {
  const { matchPercent, detail } = pick;
  const label = detail.themes[0] ?? detail.tone[0] ?? "Your taste, distilled";

  return (
    <Link href="/taste-dna" className="bento-card flex items-center gap-3 p-3 transition-colors hover:border-accent/40">
      <div
        className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
        style={{ background: `conic-gradient(var(--accent) ${matchPercent}%, rgba(217,184,118,0.15) ${matchPercent}%)` }}
        aria-hidden="true"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-background text-[11px] font-semibold text-accent">
          {matchPercent}%
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <span className="shrink-0 rounded-[var(--radius-sm)] border border-accent/40 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-accent">
          Your taste DNA
        </span>
        <p className="mt-1 truncate text-sm font-medium capitalize text-foreground">{label}</p>
        <p className="mt-0.5 truncate text-[11px] text-foreground-muted">{detail.headline}</p>
      </div>
    </Link>
  );
}
