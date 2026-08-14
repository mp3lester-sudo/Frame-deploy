export type PremiumTier = "premium" | "auteur";

/**
 * True only for the top tier specifically -- distinct from
 * isPremiumActive (which is true for *either* paid tier, plus referral
 * bonus windows). Any feature that should be exclusive to Marquee Auteur
 * (custom poster/backdrop picker, weekly Wrapped, saved filter presets,
 * etc.) checks this instead of isPremiumActive.
 *
 * Deliberately does NOT fall back to a bonus window the way
 * isPremiumActive does -- referral bonuses (see record_referral() in
 * migration 0036) only ever grant standard Premium, never Auteur, so
 * there's nothing to check here beyond premium_tier itself. A profile
 * mid-bonus-window has is_premium true but premium_tier null, and that's
 * correct: they should see Premium features, not Auteur ones.
 */
export function isAuteurActive(
  profile: { is_premium?: boolean | null; premium_tier?: string | null } | null | undefined
): boolean {
  if (!profile) return false;
  return !!profile.is_premium && profile.premium_tier === "auteur";
}

/** Human-readable label for a tier, for UI copy (manage card, badges). */
export function tierLabel(tier: PremiumTier | string | null | undefined): string {
  return tier === "auteur" ? "Marquee Auteur" : "Marquee Premium";
}

/**
 * Movie Night's group size cap, keyed off the *host's* tier (see
 * movieNightMaxParticipants) -- not each individual participant's, since
 * a session's headroom is a property of who started it, the same way
 * Zoom's free-tier 40-minute cap is the host's plan, not every
 * attendee's. Free and Premium share one cap; Auteur triples it.
 */
export const FREE_MOVIE_NIGHT_MAX_PARTICIPANTS = 8;
export const AUTEUR_MOVIE_NIGHT_MAX_PARTICIPANTS = 24;

export function movieNightMaxParticipants(
  hostProfile: { is_premium?: boolean | null; premium_tier?: string | null } | null | undefined
): number {
  return isAuteurActive(hostProfile) ? AUTEUR_MOVIE_NIGHT_MAX_PARTICIPANTS : FREE_MOVIE_NIGHT_MAX_PARTICIPANTS;
}
