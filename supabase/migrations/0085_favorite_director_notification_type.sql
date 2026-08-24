-- Adds "new_from_favorite_director" to notification_preferences' allowed
-- type values (see that table's own migration, 0043) so the new
-- proactive "new from a director you love" notification --
-- src/lib/notifications/favorite-director-alerts.ts, personalization
-- audit item #5 -- can be toggled off in Settings like every other
-- discretionary notification type.
--
-- This is a system-generated notification (no human actor, same shape as
-- "payment_failed" -- see migration 0043's comment and the Stripe webhook
-- route for that precedent), but unlike payment_failed it has no
-- financial consequence for a user who'd rather not see it, so it
-- deliberately follows the opt-out-by-toggle pattern (follow/comment/
-- reaction/movie_night_invite/movie_night_decided) rather than
-- payment_failed's always-on treatment. Opt-OUT model still applies (no
-- row for a user means enabled), so this migration alone doesn't change
-- behavior for anyone until favorite-director-alerts.ts actually starts
-- inserting rows.
alter table public.notification_preferences drop constraint if exists notification_preferences_type_check;
alter table public.notification_preferences add constraint notification_preferences_type_check
  check (type in ('follow', 'comment', 'reaction', 'movie_night_invite', 'movie_night_decided', 'new_from_favorite_director'));
