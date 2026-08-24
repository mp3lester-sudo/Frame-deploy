-- Makes the referral bonus mutual (growth audit finding): record_referral()
-- previously only ever granted bonus_premium_until to the *referrer* --
-- the friend who clicked the link and signed up got nothing extra for it,
-- which is the one-sided "refer a friend for a reward" pattern the growth
-- audit flagged as worse than it needs to be. A friend who joins because
-- someone they know vouched for the product should get the same welcome
-- bonus the referrer earns for bringing them in -- both sides better off,
-- not just the sender.
--
-- CREATE OR REPLACE rather than a new function: the RPC name/signature
-- src/lib/actions/auth.ts already calls (record_referral(p_referrer_id,
-- p_referred_id, p_bonus_days)) doesn't need to change, only what it does
-- once inside the same idempotency guard (unique referred_id) that
-- already existed.
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

  -- Already recorded (e.g. a retried request) -- don't grant a second
  -- bonus to either side.
  if v_inserted is null then
    return false;
  end if;

  update public.profiles
  set bonus_premium_until = greatest(coalesce(bonus_premium_until, now()), now()) + make_interval(days => p_bonus_days)
  where id = p_referrer_id;

  -- The mutual half: the referred account is brand new (bonus_premium_until
  -- is null), so this is just "now() + p_bonus_days" in practice, but kept
  -- as the same greatest(coalesce(...)) form as the referrer's grant above
  -- for symmetry and so it stays correct if this function is ever called
  -- again for an account that already has an active window for some other
  -- reason.
  update public.profiles
  set bonus_premium_until = greatest(coalesce(bonus_premium_until, now()), now()) + make_interval(days => p_bonus_days)
  where id = p_referred_id;

  return true;
end;
$$;
