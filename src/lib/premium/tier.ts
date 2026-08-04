export type PremiumTier = "premium" | "a_list";

/**
 * True only for the top tier specifically -- distinct from
 * isPremiumActive (which is true for *either* paid tier, plus referral
 * bonus windows). Any feature that should be exclusive to Backlot A-List
 * (custom poster/backdrop picker, weekly Wrapped, saved filter presets,
 * etc.) checks this instead of isPremiumActive.
 *
 * Deliberately does NOT fall back to a bonus window the way
 * isPremiumActive does -- referral bonuses (see record_referral() in
 * migration 0036) only ever grant standard Premium, never A-List, so
 * there's nothing to check here beyond premium_tier itself. A profile
 * mid-bonus-window has is_premium true but premium_tier null, and that's
 * correct: they should see Premium features, not A-List ones.
 */
export function isALevelActive(
  profile: { is_premium?: boolean | null; premium_tier?: string | null } | null | undefined
): boolean {
  if (!profile) return false;
  return !!profile.is_premium && profile.premium_tier === "a_list";
}

/** Human-readable label for a tier, for UI copy (manage card, badges). */
export function tierLabel(tier: PremiumTier | string | null | undefined): string {
  return tier === "a_list" ? "Backlot A-List" : "Backlot Premium";
}
