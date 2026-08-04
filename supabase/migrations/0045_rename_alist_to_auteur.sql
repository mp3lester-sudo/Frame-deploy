-- Renames the second paid tier from "a_list" to "auteur" (product name
-- changed from "Backlot A-List" to "Backlot Auteur" before the tier ever
-- went on sale -- STRIPE_AUTEUR_PRICE_ID/STRIPE_ALIST_PRICE_ID was never
-- set in production, so this is a pure rename with zero live subscribers
-- to migrate). Existing 0044_premium_tiers.sql is left as-is (migrations
-- are not edited retroactively) -- this migration corrects the value on
-- top of it instead.
--
-- Order matters: drop each check constraint before updating the rows it
-- constrains (Postgres won't let 'auteur' through a constraint that only
-- allows 'premium'/'a_list' yet), then add the constraint back with the
-- new allowed value.
alter table public.profiles
  drop constraint if exists profiles_premium_tier_check;

update public.profiles set premium_tier = 'auteur' where premium_tier = 'a_list';

alter table public.profiles
  add constraint profiles_premium_tier_check check (premium_tier in ('premium', 'auteur'));

alter table public.subscriptions
  drop constraint if exists subscriptions_tier_check;

update public.subscriptions set tier = 'auteur' where tier = 'a_list';

alter table public.subscriptions
  add constraint subscriptions_tier_check check (tier in ('premium', 'auteur'));

comment on column public.profiles.premium_tier is
  'Which paid tier this user is on, if any -- null for free accounts, and independent of is_premium/bonus_premium_until: a referral bonus window sets is_premium without ever setting premium_tier, so Auteur-exclusive features must check premium_tier specifically (see isAuteurActive), not just is_premium.';

comment on column public.subscriptions.tier is
  'Mirrors profiles.premium_tier but lives on the subscription record itself so the Stripe webhook has one place to read/write it per event. Defaults to premium for every row that predates this column -- every subscription in this table before the second tier existed was, definitionally, a Premium subscription.';
