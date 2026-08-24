-- Shareable snapshot of a pre-signup taste-teaser result (growth audit,
-- landing-page teaser). Mirrors wrapped_shares (migration 0028) almost
-- exactly -- a frozen jsonb snapshot behind a public id, with its own
-- opengraph-image route -- except this one has no user_id at all: the
-- whole point of the teaser (see landing-teaser.ts) is that it works for
-- an anonymous visitor who has no account yet, so there's no owner to
-- attach the row to. Rows are written via the service-role client from
-- shareTeaserResult() (same "no RLS insert policy, service role bypasses
-- it" pattern already used for rate_limit_buckets -- see rate-limit.ts)
-- rather than an open anon-insert RLS policy, so an arbitrary anonymous
-- client can't write directly to this table even with the anon key.
create table public.teaser_shares (
  id uuid primary key default gen_random_uuid(),
  picks jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.teaser_shares enable row level security;

-- Public read only -- an anonymous visitor following a shared link, and
-- the opengraph-image route generating its preview card, both read with
-- the anon key, no session. No insert/update/delete policy: writes only
-- ever happen through the service-role client in shareTeaserResult().
create policy "teaser shares are public" on public.teaser_shares for select using (true);
