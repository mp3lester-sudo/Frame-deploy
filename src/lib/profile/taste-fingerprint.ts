export interface GenreSlice {
  genre: string;
  pct: number;
}

/**
 * Turns a raw genre -> rating-count map into the top N slices (by share of
 * total), plus a rolled-up "Other" slice for whatever's left over -- the
 * profile page's taste-fingerprint wheel and the auto-written taste quote
 * both read from this rather than the raw counts, so there's one place
 * that owns "what actually counts as someone's top genres."
 */
export function computeGenreDistribution(genreCounts: Map<string, number>, topN = 5): GenreSlice[] {
  const total = [...genreCounts.values()].reduce((sum, n) => sum + n, 0);
  if (total === 0) return [];

  const sorted = [...genreCounts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, topN);
  const slices: GenreSlice[] = top.map(([genre, count]) => ({
    genre,
    pct: (count / total) * 100,
  }));

  const topSum = top.reduce((sum, [, count]) => sum + count, 0);
  const otherCount = total - topSum;
  if (otherCount > 0) {
    slices.push({ genre: "Other", pct: (otherCount / total) * 100 });
  }
  return slices;
}

/**
 * CSS conic-gradient stop list for the fingerprint wheel -- a single accent
 * hue at decreasing opacity per slice (matching the rest of the app's
 * one-accent-color restraint, rather than a multi-color pie chart), so the
 * wheel reads as "yours" rather than a generic analytics widget. Returns
 * the literal string to drop into a `background: conic-gradient(...)`
 * declaration.
 */
export function buildFingerprintGradient(slices: GenreSlice[], baseColor = "205,166,70"): string {
  if (slices.length === 0) return `rgba(${baseColor},0.15) 0deg 360deg`;

  const opacities = [0.65, 0.48, 0.34, 0.24, 0.16, 0.09];
  let cursor = 0;
  const stops = slices.map((slice, i) => {
    const start = cursor;
    const end = cursor + (slice.pct / 100) * 360;
    cursor = end;
    const opacity = opacities[Math.min(i, opacities.length - 1)];
    return `rgba(${baseColor},${opacity}) ${start.toFixed(2)}deg ${end.toFixed(2)}deg`;
  });
  return stops.join(", ");
}

/**
 * A short, honest line reading someone's own taste back to them --
 * "A Film Buff drawn to Drama, with real range into Horror." Needs at
 * least one real genre to say anything; returns null for a profile with
 * no rating history yet rather than a generic filler sentence. Takes the
 * already-resolved tier label (EXPERIENCE_TIER_LABEL[tier]) rather than
 * the raw tier value, so this file doesn't need its own copy of that
 * mapping.
 */
export function buildTasteQuote(
  tierLabel: string | null,
  slices: GenreSlice[],
  watchedCount: number
): string | null {
  const realSlices = slices.filter((s) => s.genre !== "Other");
  if (realSlices.length === 0 || watchedCount === 0) return null;

  const label = tierLabel || "Slate member";
  const [primary, secondary] = realSlices;

  if (!secondary) return `A ${label} drawn to ${primary.genre}.`;
  return `A ${label} drawn to ${primary.genre}, with real range into ${secondary.genre}.`;
}
