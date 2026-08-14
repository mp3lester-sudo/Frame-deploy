-- "Don't recommend again" -- a new explicit-dismissal signal from the
-- swipe-to-decide recs deck (Discover), distinct from rating a title
-- itself. Rating requires having actually watched something and carries
-- its own meaning (feeds the taste vector, shows up in Watched/profile
-- stats) -- writing a fake low rating just to suppress a title the user
-- hasn't even seen would corrupt both of those. This is a separate,
-- narrower signal: "don't show me this again," full stop, with no
-- opinion recorded about whether it's good or bad.
--
-- Modeled after watchlist (0020) rather than folded into ratings: a
-- private, per-user set with no rating/review semantics attached.
create table public.title_dismissals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title_id uuid not null references public.titles(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  unique (user_id, title_id)
);

create index title_dismissals_user_idx on public.title_dismissals(user_id);

alter table public.title_dismissals enable row level security;

-- Private to the owner, same policy shape as watchlist -- a "stop
-- recommending this" signal is personal, not a public claim.
create policy "own title dismissals" on public.title_dismissals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
