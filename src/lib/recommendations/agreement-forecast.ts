import type { CompatibilityWithNames } from "@/lib/matchmaking/compute";

/**
 * Movie Night "agreement forecast" (magic-moments audit) -- a pre-vote
 * brief synthesized from data the page already fetches for the "Taste
 * comparison" cards (computeCompatibilityForUsers per participant vs. the
 * viewer). No new computation, no new query: this just reads across the
 * comparisons that already exist and picks out the single strongest
 * agreement and the single clearest divergence, phrased as plain
 * sentences instead of a grid of percentage cards.
 */

export interface AgreementForecastInput {
  name: string;
  compatibility: CompatibilityWithNames;
}

const MIN_PERCENT_FOR_AGREEMENT_NOTE = 80;

/**
 * Pure: at most two lines -- "you and X almost always agree on Y" for the
 * strongest qualifying pairing, and "Z tends to want something different"
 * for the clearest divergence among the rest. Returns an empty array when
 * nobody has enough shared rating history yet (mirrors
 * TasteCompatibilityCard's own hasEnoughData gate, so this never invents a
 * forecast from thin data).
 */
export function buildAgreementForecast(inputs: AgreementForecastInput[]): string[] {
  const withData = inputs.filter((i) => i.compatibility.hasEnoughData);
  if (withData.length === 0) return [];

  const lines: string[] = [];

  const strongestAgreement = [...withData]
    .filter((i) => i.compatibility.sharedFavoriteGenres.length > 0 && i.compatibility.percent >= MIN_PERCENT_FOR_AGREEMENT_NOTE)
    .sort((a, b) => b.compatibility.percent - a.compatibility.percent)[0];

  if (strongestAgreement) {
    const genre = strongestAgreement.compatibility.sharedFavoriteGenres[0];
    lines.push(`You and ${strongestAgreement.name} almost always agree on ${genre}`);
  }

  const clearestDivergence = [...withData]
    .filter((i) => i.compatibility.biggestDisagreementGenre && i.name !== strongestAgreement?.name)
    .sort((a, b) => a.compatibility.percent - b.compatibility.percent)[0];

  if (clearestDivergence) {
    lines.push(
      `${clearestDivergence.name} tends to want something different than the group on ${clearestDivergence.compatibility.biggestDisagreementGenre}`
    );
  }

  return lines.slice(0, 2);
}
