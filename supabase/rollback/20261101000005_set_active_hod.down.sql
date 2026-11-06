-- ROLLBACK of 5/7 (set_active_hod). No data loss; the active-HOD flag can then no longer be changed via the API.
-- Then: npx supabase@2.122.0 migration repair --status reverted 20261101000005

drop function if exists public.clear_active_hod();
drop function if exists public.set_active_hod(text);
