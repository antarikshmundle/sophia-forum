-- ROLLBACK of 2/7 (profiles). STAGING ONLY unless separately approved.
-- Data loss: ALL profile rows (role assignments). The auth users themselves are NOT touched.
-- Requires 3/7–7/7 rolled back first (their policies call app_role()).
-- Then: npx supabase@2.122.0 migration repair --status reverted 20261101000002

drop function if exists public.app_role();
drop table if exists public.profiles;
