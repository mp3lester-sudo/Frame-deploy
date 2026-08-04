-- Per-user custom poster/backdrop for a title -- Auteur-exclusive perk
-- (task #339). Deliberately per-viewer, not a global edit to
-- public.titles: this is "how this person sees this movie on their own
-- screen," not a crowd-sourced correction to the catalogue, so there is
-- no moderation/review question here the way editing the shared titles
-- row would raise.
create table public.title_image_overrides (
  user_id uuid not null references public.profiles(id) on delete cascade,
  title_id uuid not null references public.titles(id) on delete cascade,
  poster_url text,
  backdrop_url text,
  updated_at timestamptz not null default now(),
  primary key (user_id, title_id)
);

alter table public.title_image_overrides enable row level security;

create policy "users manage their own title image overrides" on public.title_image_overrides
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

comment on table public.title_image_overrides is
  'Auteur-only (see isAuteurActive) -- gated in lib/actions/title-image-overrides.ts, not by RLS, same split as discover_filter_presets (migration 0046).';
