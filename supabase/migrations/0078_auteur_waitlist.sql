-- Auteur tier is fully built (see isAuteurActive gating helper and its 13
-- call sites) but stays unpurchasable until STRIPE_AUTEUR_PRICE_ID is set
-- (premium/page.tsx). Until then, PremiumUpgradeCard showed a dead
-- disabled "Coming soon" button with no way to express interest -- this
-- column lets us capture that interest instead so nobody who's ready to
-- pay is just turned away with no follow-up path.
alter table public.profiles
  add column auteur_waitlist_requested_at timestamptz;
