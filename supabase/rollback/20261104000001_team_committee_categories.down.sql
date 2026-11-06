-- ROLLBACK of 20261104000001 (team committee categories). Manual only (SQL editor), STAGING ONLY unless separately
-- approved; never a forward migration. Back to the 12 categories of migration 7b; no rows are changed or deleted.
-- Fails (and changes nothing) while any team member still uses one of the five added categories: move those records
-- back first (node qa/cms-db/recategorise-committee-2026.mjs --revert, dry run, then --apply).
begin;

alter table public.team_members
  drop constraint team_members_category_check,
  add constraint team_members_category_check check (category in (
    'President', 'Vice President', 'Secretary', 'Joint Secretary', 'Technical Team',
    'Event Management Team', 'Social Media Team', 'Cultural Team', 'Promotional Team',
    'Documentation Team', 'Girls Representative', 'Sports Team'));

commit;
