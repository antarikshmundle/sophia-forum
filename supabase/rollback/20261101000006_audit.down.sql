-- ROLLBACK of 6/7 (audit). STAGING ONLY unless separately approved.
-- Data loss: ALL audit_log entries.
-- Then: npx supabase@2.122.0 migration repair --status reverted 20261101000006

drop trigger if exists hod_messages_audit on public.hod_messages;
drop trigger if exists faculty_audit on public.faculty;
drop function if exists public.write_audit_log();
drop table if exists public.audit_log;
