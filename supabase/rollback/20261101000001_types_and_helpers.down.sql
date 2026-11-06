-- ROLLBACK of 1/7 (types_and_helpers). No data loss on its own; requires 2/7–7/7 rolled back first.
-- Then: npx supabase@2.122.0 migration repair --status reverted 20261101000001

drop function if exists public.set_updated_fields();
drop type if exists public.message_status;
drop type if exists public.app_role;
