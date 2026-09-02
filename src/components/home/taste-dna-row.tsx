import Link from "next/link";
import { ChevronRight } from "lucide-react";
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
    <Link href="/taste-dna" className="flex items-center gap-3 py-3">
      <div
        className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
        style={{ background: `conic-gradient(var(--accent) ${matchPercent}%, rgba(217,184,118,0.15) ${matchPercent}%)` }}
        aria-hidden="true"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-background text-[10px] font-semibold text-accent">
          {matchPercent}%
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <span className="text-gold-foil shrink-0 text-[10px] font-bold uppercase tracking-[0.14em]">Your taste DNA</span>
        <p className="mt-0.5 truncate text-sm font-semibold capitalize text-foreground">{label}</p>
        <p className="mt-0.5 truncate text-[12px] text-foreground-muted">{detail.headline}</p>
      </div>
      <ChevronRight size={16} className="shrink-0 text-foreground-muted" aria-hidden />
    </Link>
  );
}
