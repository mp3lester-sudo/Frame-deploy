-- Adds tier tracking so a second, higher subscription tier (Backlot
-- A-List, above the existing Backlot Premium) can exist alongside it.
-- is_premium is left completely untouched -- it still means "has some
-- paid tier active" exactly as it always has, so none of the existing
-- isPremiumActive() call sites (Discover filters, Wrapped cadence, Ask
-- Backlot limits, the promo banner, etc.) need to change at all. This
-- only adds a way to tell the two paid tiers apart for the handful of
-- features that will be A-List-exclusive.
alter table public.profiles
  add column if not exists premium_tier text check (premium_tier in ('premium', 'a_list'));

comment on column public.profiles.premium_tier is
  'Which paid tier this user is on, if any -- null for free accounts, and independent of is_premium/bonus_premium_until: a referral bonus window sets is_premium without ever setting premium_tier, so A-List-exclusive features must check premium_tier specifically (see isALevelActive), not just is_premium.';

alter table public.subscriptions
  add column if not exists tier text not null default 'premium' check (tier in ('premium', 'a_list'));

comment on column public.subscriptions.tier is
  'Mirrors profiles.premium_tier but lives on the subscription record itself so the Stripe webhook has one place to read/write it per event. Defaults to premium for every row that predates this column -- every subscription in this table before A-List existed was, definitionally, a Premium subscription.';
