-- "Best to worst" needs more than raw tmdb_rating: a title with three 10/10
-- votes would otherwise outrank a genuinely acclaimed film with thousands of
-- 8/10 votes. This is the same fix IMDb itself applies (a Bayesian/weighted
-- average) — a title's own rating only counts in full once it has enough
-- votes behind it; below that it gets pulled toward the catalogue's average.
--
-- Constants below were derived from this catalogue's actual distribution
-- (3,598 rated titles as of this migration): simple mean rating ~7.17
-- (rounded to 7.2), median vote count ~1,336 (rounded to 1000 as the
-- confidence threshold m). A generated column keeps this always in sync
-- with tmdb_rating/tmdb_vote_count with no separate backfill needed.
alter table public.titles add column if not exists weighted_rating numeric
  generated always as (
    case
      when tmdb_vote_count is not null and tmdb_vote_count > 0 and tmdb_rating is not null then
        (tmdb_vote_count::numeric / (tmdb_vote_count + 1000)) * tmdb_rating
          + (1000::numeric / (tmdb_vote_count + 1000)) * 7.2
      else null
    end
  ) stored;

create index if not exists titles_weighted_rating_idx on public.titles (weighted_rating desc nulls last);
