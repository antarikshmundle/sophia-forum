-- ROLLBACK of 4/7 (hod_messages). STAGING ONLY unless separately approved.
-- Data loss: ALL HOD messages (drafts, approved, published and archived).
-- Requires 6/7 rolled back first (its trigger references this table).
-- Then: npx supabase@2.122.0 migration repair --status reverted 20261101000004

drop table if exists public.hod_messages;            -- drops its policies, indexes and triggers
drop function if exists public.hod_messages_guard_publish();
