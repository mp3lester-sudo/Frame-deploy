/**
 * A user counts as Premium if either is true: their subscription is active
 * (is_premium, owned exclusively by the Stripe webhook -- see
 * src/app/api/stripe/webhook/route.ts) OR they're inside a referral bonus
 * window (bonus_premium_until, granted by record_referral() in migration
 * 0036). Kept as its own function rather than inlined at each call site so
 * the two sources can never silently drift apart across the ~4 places that
 * gate on Premium.
 */
export function isPremiumActive(
  profile: { is_premium?: boolean | null; bonus_premium_until?: string | null } | null | undefined
): boolean {
  if (!profile) return false;
  if (profile.is_premium) return true;
  return isBonusWindowActive(profile.bonus_premium_until);
}

/**
 * Split out from isPremiumActive so referral-card.tsx (which only cares
 * about the bonus window, not the combined Premium check) can call it
 * directly. Also keeps the Date.now() read out of any component's render
 * body -- react-hooks/purity flags calling it inline during render, so
 * this only ever gets called from event handlers/plain helpers, never
 * inlined into JSX.
 */
export function isBonusWindowActive(bonusPremiumUntil: string | null | undefined): boolean {
  return !!bonusPremiumUntil && new Date(bonusPremiumUntil).getTime() > Date.now();
}
