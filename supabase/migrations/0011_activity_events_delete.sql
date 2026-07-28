-- activity_events had select+insert policies but no delete policy, so
-- unrateTitle's delete of the "rated" event silently affected 0 rows under
-- RLS (no error — the row is just invisible to the deleting statement).
-- Needed for the "cancel watched" / undo-a-misclick feature.
create policy "users delete own activity" on public.activity_events
  for delete using (auth.uid() = user_id);
