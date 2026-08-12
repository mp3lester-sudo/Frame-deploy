-- lists.user_id has never had its own index -- unlike watchlist (see
-- watchlist_user_idx in 0020_watchlist.sql), which got one from the start.
-- The /lists page (src/app/lists/page.tsx, "Your Lists") runs
-- eq("user_id", viewer.id) on every visit, which has been a full
-- sequential scan of the whole lists table this whole time. Same reasoning
-- as 0038_performance_indexes.sql: cheap to add, gets worse as the table
-- grows, and this is a page a user can reach with one click from the nav.
create index if not exists lists_user_idx on public.lists (user_id);
