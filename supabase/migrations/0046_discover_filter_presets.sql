-- Saved Discover filter combinations -- Auteur-exclusive perk (task
-- #340). Each row is just a named snapshot of the same five query params
-- Discover's own filter rail already reads (genre/era/pacing/tone/mood,
-- see src/app/discover/page.tsx) -- no new filtering logic, this table
-- only remembers a combination so it can be reapplied with one click
-- instead of rebuilding it filter-by-filter each visit.
create table public.discover_filter_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  genre text,
  era text,
  pacing text,
  tone text,
  mood text,
  created_at timestamptz not null default now()
);

create index discover_filter_presets_user_id_idx on public.discover_filter_presets(user_id);

alter table public.discover_filter_presets enable row level security;

create policy "users manage their own discover filter presets" on public.discover_filter_presets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

comment on table public.discover_filter_presets is
  'Auteur-only (see isAuteurActive) -- gated in lib/actions/discover-presets.ts, not by RLS, since ordinary users being unable to INSERT here at all is enough; there is no case where a non-Auteur row should exist to hide via RLS.';
