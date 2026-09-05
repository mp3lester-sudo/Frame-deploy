import { cn } from "@/lib/utils";
import { gradeProgress } from "@/lib/profile/cinema-score";

/**
 * Cinema Score's "seal" -- a small radial report-card badge replacing the
 * old bare letter-grade text in the profile page's ticket-stub stat strip
 * (task #610: "redesign Cinema Score into something creative"). Reuses the
 * exact conic-gradient-ring technique the Taste fingerprint wheel already
 * established just above this strip on the same page, so the two read as
 * one consistent "radial stat" visual language rather than two unrelated
 * treatments competing for attention.
 *
 * The ring itself is a live progress meter -- how far through the CURRENT
 * letter grade's point band this profile sits (gradeProgress), not just a
 * decorative frame -- so "B+" reads as a badge actively filling toward "A-"
 * rather than a static label. A+ (the top of the 11-step scale) always
 * shows a full ring, since there's nothing further to progress toward.
 *
 * The gold-foil shimmer (.text-gold-foil, the same "this is precious"
 * treatment used on the wordmark and Auteur-tier surfaces) is reserved for
 * the A-/A/A+ band specifically -- earned only at the top of the scale,
 * echoing how the Auteur badge nearby is deliberately a different, more
 * precious-looking treatment than the plain outlined tier pill everyone
 * gets. Every other grade still gets the same ring shape and gold accent
 * color; only the shimmer on the letter itself is gated.
 */
export function CinemaScoreSeal({ grade, points }: { grade: string; points: number }) {
  const progress = gradeProgress(points);
  const progressDeg = Math.round(progress * 360);
  const isTopTier = grade.startsWith("A");

  return (
    <div
      className="wheel-in mx-auto flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
      style={{
        background: `conic-gradient(var(--accent) 0deg ${progressDeg}deg, rgb(217 184 118 / 0.15) ${progressDeg}deg 360deg)`,
      }}
      title={`${points.toLocaleString()} Cinema Score points`}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-background">
        {/* translate-y-[4px]: Instrument Serif (font-display) reserves
            noticeably more headroom above a capital letter's cap-height
            than below the baseline -- flex centers the glyph's LINE BOX,
            not its ink, so at leading-none the letter reads visibly high
            in the circle instead of centered (the exact "off-center A+"
            the user flagged). Nudging down by the measured ascent/descent
            gap re-centers the actual glyph; verified against a live
            screenshot of the rendered seal, not just computed from
            assumed font metrics. inline-block so the transform is honored
            consistently (some WebKit versions are stricter about
            transforms on inline elements). */}
        <span
          className={cn(
            "inline-block translate-y-[4px] font-display text-lg font-bold leading-none",
            isTopTier && "text-gold-foil"
          )}
        >
          {grade}
        </span>
      </div>
    </div>
  );
}
