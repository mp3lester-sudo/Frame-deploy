-- Audit log for admin-initiated moderation actions (suspend/unsuspend a
-- user, delete reported content). Backs the new admin user-lookup tool
-- (src/app/admin/users) and the enforcement buttons added to
-- /admin/reports -- previously an admin could view and dismiss reports
-- but had no way to actually act on one, and definitely no record of
-- having done so. This table exists purely so "did we suspend this
-- person, when, and why" has a real answer later, not because any
-- feature reads it back at request time.
create table public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id) on delete set null,
  target_user_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('suspend_user', 'unsuspend_user', 'delete_content')),
  reason text check (char_length(reason) <= 1000),
  -- Free-form context (e.g. which report id triggered this, which content
  -- type/id was deleted) -- deliberately jsonb rather than new columns per
  -- action type, since the shape of "what happened" differs by action.
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index admin_actions_target_idx on public.admin_actions(target_user_id);
create index admin_actions_created_idx on public.admin_actions(created_at desc);

alter table public.admin_actions enable row level security;
-- No policies granted to anon/authenticated -- same privileged-server-only
-- pattern as rate_limit_buckets and subscriptions. This table is written
-- and read exclusively via the service-role client from
-- src/lib/actions/admin.ts's requireAdmin()-gated actions, never through
-- a user's own session.
