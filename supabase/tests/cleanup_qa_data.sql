-- STAGING ONLY. Removes the test records the QA suites leave behind (ids starting with "qa-").
-- Run in the SQL editor of sophia-cms-staging only. The SQL editor runs as the project owner, which is why it can
-- delete HOD messages and faculty with message history (the API can't, by design: D2).
-- Audit entries are kept (D5). Storage objects under faculty/qa-*/ are removed by the storage test itself.
-- Check the project name in the dashboard header before running.

begin;
  -- no qa- record may stay the active HOD (the guard trigger blocks deleting an active HOD)
  update public.faculty set is_active_hod = false where id like 'qa-%' and is_active_hod;
  delete from public.hod_messages where faculty_id like 'qa-%';
  delete from public.faculty where id like 'qa-%';
commit;

select
  (select count(*) from public.faculty where id like 'qa-%')        as qa_faculty_left,
  (select count(*) from public.hod_messages where faculty_id like 'qa-%') as qa_messages_left;
