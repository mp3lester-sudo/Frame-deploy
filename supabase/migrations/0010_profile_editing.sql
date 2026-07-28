-- Letterboxd-style "four favorite films" on a profile.
create table public.favorite_titles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  title_id uuid not null references public.titles(id) on delete cascade,
  position smallint not null check (position between 1 and 4),
  created_at timestamptz not null default now(),
  primary key (user_id, position),
  unique (user_id, title_id)
);

alter table public.favorite_titles enable row level security;

create policy "favorite titles are public" on public.favorite_titles for select using (true);
create policy "users manage own favorite titles" on public.favorite_titles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Avatar uploads: public bucket, but each user may only write inside their
-- own "{user_id}/..." folder (storage.foldername splits the object path on
-- "/", so [1] is the top-level folder).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatar images are publicly accessible" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "users can upload their own avatar" on storage.objects
  for insert with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users can update their own avatar" on storage.objects
  for update using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users can delete their own avatar" on storage.objects
  for delete using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
