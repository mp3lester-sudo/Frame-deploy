-- Retroactive migration for the notifications table. The notifications
-- feature (see src/lib/actions/notifications.ts) was originally shipped
-- against a migration applied directly via the Supabase SQL Editor and was
-- never committed to this repo -- supabase/migrations has no record of the
-- table's actual definition, only code that assumes it exists with columns
-- id, type, actor_id, recipient_id, title_id, ref_id, read_at, created_at.
--
-- This migration does NOT recreate the table (its exact live definition is
-- unknown, and a wrong guess here could conflict with it) -- it only adds
-- the two indexes the feature's actual query patterns need. Both use
-- `if not exists` so this is safe to run regardless of whether an index
-- with a different name already covers the same columns.
--
-- getUnreadNotificationCount() (called from src/app/layout.tsx on every
-- single authenticated page view across the whole app) filters
-- `recipient_id = X and read_at is null` -- without an index this is a
-- full sequential scan of the whole table on every single page load,
-- for every logged-in user, getting slower as the table grows from every
-- follow/comment/reaction/movie-night invite the app sends. A partial
-- index scoped to unread rows keeps this query fast and small regardless
-- of how large the table's read history gets.
create index if not exists notifications_unread_by_recipient_idx
  on public.notifications (recipient_id)
  where read_at is null;

-- The /notifications page itself: `recipient_id = X order by created_at
-- desc limit 50`.
create index if not exists notifications_recipient_created_at_idx
  on public.notifications (recipient_id, created_at desc);

-- Separately: follows.followee_id has never had its own index -- the
-- table's primary key is (follower_id, followee_id), which only serves
-- lookups keyed on follower_id (the "who do I follow" queries). Every
-- single profile page view runs `select count(*) ... eq("followee_id", ...)`
-- for the follower count (src/app/profile/[username]/page.tsx), which has
-- been a full sequential scan of the whole follows table this whole time --
-- gets slower as more follows accumulate app-wide, not just for the one
-- profile being viewed.
create index if not exists follows_followee_idx on public.follows (followee_id);
