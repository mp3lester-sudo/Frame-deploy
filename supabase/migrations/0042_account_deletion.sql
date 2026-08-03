-- Backs the self-service "Delete account" flow in Settings
-- (see deleteAccount() in src/lib/actions/auth.ts).
--
-- Deliberately does NOT hard-delete the auth.users row. The notifications
-- table (see migration 0038's header comment) was applied by hand outside
-- this repo, so its actual FK on-delete behavior toward profiles/auth.users
-- is unverified -- calling supabase.auth.admin.deleteUser() in production
-- without knowing that could throw an unhandled foreign-key violation on
-- an arbitrary user's delete request, or (worse, if some other
-- undocumented FK is more permissive than expected) silently cascade
-- further than intended. Anonymizing the profile row and banning login
-- via the Auth admin API achieves the same practical outcome -- the
-- account can no longer be used, and personally-identifying fields are
-- gone -- without depending on the exact shape of tables this repo can't
-- fully see.
alter table public.profiles add column if not exists deleted_at timestamptz;

-- Search/discovery/leaderboard-style queries should exclude deleted
-- accounts going forward.
create index if not exists profiles_deleted_at_idx on public.profiles (deleted_at) where deleted_at is not null;
