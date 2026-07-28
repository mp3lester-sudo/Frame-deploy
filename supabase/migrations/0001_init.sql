-- Taste — Phase 2: Core Database Schema
-- Run against a Supabase Postgres project. Requires the pgvector extension.

create extension if not exists vector;
create extension if not exists pg_trgm;

-- =========================================================
-- USERS / PROFILES
-- =========================================================
-- auth.users is managed by Supabase Auth. profiles extends it 1:1.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text,
  avatar_url text,
  bio text,
  is_creator boolean not null default false,
  is_premium boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_username_trgm_idx on public.profiles using gin (username gin_trgm_ops);

-- =========================================================
-- CATALOG: movies, tv shows, people
-- =========================================================
create table public.titles (
  id uuid primary key default gen_random_uuid(),
  tmdb_id integer unique,
  type text not null check (type in ('movie', 'tv')),
  name text not null,
  original_name text,
  overview text,
  release_date date,
  runtime_minutes integer,
  poster_url text,
  backdrop_url text,
  original_language text,

  -- Rich "Taste" metadata (Phase 1 §7 — this is the moat)
  genres text[] default '{}',
  themes text[] default '{}',
  tone text[] default '{}',                 -- e.g. {"dark","hopeful"}
  pacing text,                               -- 'slow' | 'moderate' | 'fast'
  violence_level smallint,                   -- 0-5
  comedy_level smallint,                     -- 0-5
  emotional_intensity smallint,              -- 0-5
  dialogue_density smallint,                 -- 0-5
  ending_type text,                          -- 'happy' | 'ambiguous' | 'tragic' | 'twist' | ...
  color_palette text[],
  mood_tags text[] default '{}',

  tmdb_rating numeric(3,1),
  tmdb_vote_count integer,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index titles_name_trgm_idx on public.titles using gin (name gin_trgm_ops);
create index titles_genres_idx on public.titles using gin (genres);
create index titles_mood_tags_idx on public.titles using gin (mood_tags);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  tmdb_id integer unique,
  name text not null,
  role text,              -- primary known-for role, informational only
  photo_url text,
  created_at timestamptz not null default now()
);

create table public.title_credits (
  title_id uuid not null references public.titles(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  credit_type text not null check (credit_type in ('director', 'writer', 'composer', 'actor', 'cinematographer')),
  character_name text,
  billing_order integer,
  primary key (title_id, person_id, credit_type)
);

create table public.streaming_availability (
  title_id uuid not null references public.titles(id) on delete cascade,
  provider text not null,        -- 'netflix' | 'hulu' | 'max' | ...
  region text not null default 'US',
  offer_type text not null,      -- 'subscription' | 'rent' | 'buy'
  url text,
  updated_at timestamptz not null default now(),
  primary key (title_id, provider, region, offer_type)
);

-- =========================================================
-- RATINGS / REVIEWS / WATCH HISTORY
-- =========================================================
create table public.watch_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title_id uuid not null references public.titles(id) on delete cascade,
  watched_at timestamptz not null default now(),
  source text default 'manual',   -- 'manual' | 'netflix_import' | 'letterboxd_import' | ...
  unique (user_id, title_id, watched_at)
);

create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title_id uuid not null references public.titles(id) on delete cascade,
  score numeric(2,1) not null check (score >= 0.5 and score <= 5.0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, title_id)
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title_id uuid not null references public.titles(id) on delete cascade,
  body text not null,
  contains_spoilers boolean not null default false,
  like_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reviews_title_idx on public.reviews(title_id);
create index reviews_user_idx on public.reviews(user_id);

create table public.review_reactions (
  review_id uuid not null references public.reviews(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null check (reaction in ('agree', 'disagree', 'hot_take', 'need_to_watch')),
  created_at timestamptz not null default now(),
  primary key (review_id, user_id)
);

-- =========================================================
-- LISTS
-- =========================================================
create table public.lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.list_items (
  list_id uuid not null references public.lists(id) on delete cascade,
  title_id uuid not null references public.titles(id) on delete cascade,
  position integer not null default 0,
  note text,
  added_at timestamptz not null default now(),
  primary key (list_id, title_id)
);

-- =========================================================
-- SOCIAL GRAPH / FEED
-- =========================================================
create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followee_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in ('rated', 'reviewed', 'watched', 'list_created', 'followed')),
  title_id uuid references public.titles(id) on delete cascade,
  ref_id uuid,                    -- points at rating/review/list id depending on event_type
  created_at timestamptz not null default now()
);

create index activity_user_created_idx on public.activity_events(user_id, created_at desc);

-- =========================================================
-- MOVIE NIGHT (group decision-making)
-- =========================================================
create table public.movie_nights (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'collecting' check (status in ('collecting', 'decided', 'cancelled')),
  decided_title_id uuid references public.titles(id),
  created_at timestamptz not null default now()
);

create table public.movie_night_participants (
  movie_night_id uuid not null references public.movie_nights(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  available_providers text[] default '{}',
  excluded_genres text[] default '{}',
  mood text,
  joined_at timestamptz not null default now(),
  primary key (movie_night_id, user_id)
);

-- =========================================================
-- TASTE GRAPH: embeddings (Phase 1 §7-8, Phase 6)
-- =========================================================
-- One embedding per title, generated from its rich metadata (see packages/ai).
create table public.title_embeddings (
  title_id uuid primary key references public.titles(id) on delete cascade,
  embedding vector(1536) not null,
  model text not null default 'text-embedding-3-small',
  updated_at timestamptz not null default now()
);

create index title_embeddings_ivfflat_idx on public.title_embeddings
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- One evolving taste vector per user, updated incrementally from their activity.
create table public.taste_vectors (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  embedding vector(1536) not null,
  sample_size integer not null default 0,
  updated_at timestamptz not null default now()
);

-- Interpretable taste attributes shown back to the user ("Entertainment DNA").
create table public.taste_attributes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  pacing_preference text,
  violence_tolerance smallint,
  comedy_tolerance smallint,
  emotional_intensity_preference smallint,
  favorite_genres text[] default '{}',
  favorite_decades text[] default '{}',
  favorite_directors uuid[] default '{}',
  updated_at timestamptz not null default now()
);

-- =========================================================
-- BILLING (Phase 9)
-- =========================================================
create table public.subscriptions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'inactive',
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

-- =========================================================
-- updated_at trigger helper
-- =========================================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.titles for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.ratings for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.reviews for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.lists for each row execute function public.set_updated_at();
