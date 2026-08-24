-- Shareable snapshot of a two-person taste-compatibility result (growth
-- audit finding: TasteCompatibilityCard -- see profile/[username]/page.tsx
-- and movie-night/[id]/page.tsx -- only ever rendered inline for someone
-- already logged in and already looking at that exact page; there was no
-- standalone, shareable "You and Alex: 87% compatible" artifact with its
-- own link and preview image. A compatibility score is inherently
-- two-person content -- the recipient is personally named in it, a much
-- stronger hook than a generic app share -- so this mirrors wrapped_shares
-- (migration 0028) almost exactly: a frozen jsonb-free snapshot behind a
-- public id, with viewer_name/other_name captured as text at share time
-- (not re-joined against profiles on read) so a later display-name change
-- or account deletion doesn't retroactively change or break an already-
-- shared card.
create table public.compatibility_shares (
  id uuid primary key default gen_random_uuid(),
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  other_id uuid not null references public.profiles(id) on delete cascade,
  viewer_name text not null,
  other_name text not null,
  percent int not null,
  shared_genres text[] not null default '{}',
  shared_directors text[] not null default '{}',
  disagreement_genre text,
  created_at timestamptz not null default now()
);

create index compatibility_shares_viewer_id_idx on public.compatibility_shares(viewer_id);

alter table public.compatibility_shares enable row level security;

-- Public read (same reasoning as wrapped_shares) -- an anonymous visitor
-- following a shared link, and the opengraph-image route generating its
-- preview card, both read with the anon key, no session. Nothing more
-- sensitive is exposed than what TasteCompatibilityCard already shows
-- in-app: a percent, shared favorite genres/directors, one disagreement
-- genre -- never either person's actual ratings.
create policy "compatibility shares are public" on public.compatibility_shares for select using (true);

-- Only the viewer who generated a comparison can freeze/share it -- the
-- "other" person doesn't get a say in whether it's created (same as they
-- don't get a say in the in-app TasteCompatibilityCard showing up on
-- their own profile page today), but shares are otherwise immutable (no
-- update/delete policy).
create policy "users create own compatibility shares" on public.compatibility_shares
  for insert with check (auth.uid() = viewer_id);
