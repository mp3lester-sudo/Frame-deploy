-- Growth features: re-engagement email cadence tracking + referral loop.

-- ---- Re-engagement email (#265) ----
-- Tracks the last time we emailed an inactive user so the cron job (see
-- src/app/api/cron/reengagement/route.ts) doesn't re-send every run.
alter table public.profiles add column last_reengagement_email_at timestamptz;

-- ---- Referral loop (#266) ----
alter table public.profiles add column referral_code text;
alter table public.profiles add column referred_by uuid references public.profiles(id) on delete set null;
-- Bonus Premium window earned via referrals, kept fully separate from
-- is_premium (which the Stripe webhook, src/app/api/stripe/webhook/route.ts,
-- owns exclusively) so a referral reward can never be clobbered by an
-- unrelated subscription-status event, and vice versa. See
-- src/lib/premium/is-premium.ts for how the two combine at read time.
alter table public.profiles add column bonus_premium_until timestamptz;

-- Backfill existing accounts with a referral code before the column is
-- made required -- id-derived rather than random so the one-time backfill
-- can't collide with itself mid-migration.
update public.profiles
set referral_code = lower(substr(md5(id::text), 1, 8))
where referral_code is null;

alter table public.profiles alter column referral_code set not null;
create unique index profiles_referral_code_idx on public.profiles(referral_code);

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  -- unique: each account can only ever be counted as "referred" once, so a
  -- signup can't be replayed against record_referral() to keep re-granting
  -- the referrer a bonus.
  referred_id uuid not null references public.profiles(id) on delete cascade unique,
  created_at timestamptz not null default now()
);

create index referrals_referrer_idx on public.referrals(referrer_id);

alter table public.referrals enable row level security;

create policy "users view own referrals made" on public.referrals
  for select using (auth.uid() = referrer_id);
create policy "users insert own referral record" on public.referrals
  for insert with check (auth.uid() = referred_id);

-- Atomically records a referral and grants the referrer a bonus Premium
-- extension. security definer because the referred user (the one actually
-- calling this, right after signup) has no RLS-level write access to the
-- referrer's own profile row otherwise -- see "users manage own profile"
-- in 0002_rls.sql, which restricts profile updates to auth.uid() = id.
create or replace function public.record_referral(
  p_referrer_id uuid,
  p_referred_id uuid,
  p_bonus_days int default 14
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted uuid;
begin
  if p_referrer_id = p_referred_id then
    return false;
  end if;

  insert into public.referrals (referrer_id, referred_id)
  values (p_referrer_id, p_referred_id)
  on conflict (referred_id) do nothing
  returning referred_id into v_inserted;

  -- Already recorded (e.g. a retried request) -- don't grant a second bonus.
  if v_inserted is null then
    return false;
  end if;

  update public.profiles
  set bonus_premium_until = greatest(coalesce(bonus_premium_until, now()), now()) + make_interval(days => p_bonus_days)
  where id = p_referrer_id;

  return true;
end;
$$;

-- Finds accounts eligible for a re-engagement email (see
-- src/lib/reengagement/campaign.ts, run by the daily
-- /api/cron/reengagement route): inactive for p_inactive_days (using
-- activity_events as the activity signal, falling back to created_at for
-- accounts that have never logged an event) and not emailed within the
-- last p_cooldown_days. A single indexed query rather than pulling every
-- profile into the app and computing this in JS.
create or replace function public.reengagement_candidates(
  p_inactive_days int default 14,
  p_cooldown_days int default 30
)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select p.id as user_id
  from public.profiles p
  left join lateral (
    select max(ae.created_at) as last_activity
    from public.activity_events ae
    where ae.user_id = p.id
  ) a on true
  where p.created_at <= now() - make_interval(days => p_inactive_days)
    and coalesce(a.last_activity, p.created_at) <= now() - make_interval(days => p_inactive_days)
    and (p.last_reengagement_email_at is null or p.last_reengagement_email_at <= now() - make_interval(days => p_cooldown_days));
$$;
