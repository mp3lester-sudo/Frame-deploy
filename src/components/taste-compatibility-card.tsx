import type { CompatibilityWithNames } from "@/lib/matchmaking/compute";
import { Card } from "@/components/ui/card";

/**
 * Shared rendering for computeCompatibilityForUsers' output — originally
 * inline on the profile page, extracted so Movie Night can show the same
 * "how do our tastes compare" card for each pairing in a session.
 */
export function TasteCompatibilityCard({
  compatibility,
  otherName,
}: {
  compatibility: CompatibilityWithNames;
  otherName: string;
}) {
  if (!compatibility.hasEnoughData) {
    return (
      <p className="text-xs text-foreground-muted">
        Not enough ratings from both of you yet to compute compatibility with {otherName}.
      </p>
    );
  }

  return (
    <Card>
      <p className="font-display text-lg">
        You and {otherName} are <span className="text-accent">{compatibility.percent}%</span> compatible
      </p>
      {compatibility.sharedFavoriteGenres.length > 0 && (
        <p className="mt-2 text-sm text-foreground-muted">
          You both love: {compatibility.sharedFavoriteGenres.join(", ")}
        </p>
      )}
      {compatibility.sharedFavoriteDirectors.length > 0 && (
        <p className="mt-1 text-sm text-foreground-muted">
          You both rank {compatibility.sharedFavoriteDirectors.map((d) => d.name).join(", ")} among your
          favorite directors
        </p>
      )}
      {compatibility.biggestDisagreementGenre && (
        <p className="mt-1 text-sm text-foreground-muted">
          Your biggest disagreement: {compatibility.biggestDisagreementGenre}
        </p>
      )}
    </Card>
  );
}
