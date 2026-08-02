// Kept in sync with the SQL default in record_referral() (migration 0036) --
// the default there covers direct RPC calls made outside this app (e.g. a
// future admin tool), while this constant is what src/lib/actions/auth.ts
// actually passes on every signup.
export const REFERRAL_BONUS_DAYS = 14;
