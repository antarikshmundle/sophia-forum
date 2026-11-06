-- ROLLBACK of 3/7 (faculty). STAGING ONLY unless separately approved.
-- Data loss: ALL faculty records (photos in storage are NOT removed by this script).
-- Requires 4/7, 5/7 and 6/7 rolled back first.
-- Then: npx supabase@2.122.0 migration repair --status reverted 20261101000003

drop table if exists public.faculty;                 -- drops its policies, indexes and triggers
drop function if exists public.faculty_guard_active_hod();
