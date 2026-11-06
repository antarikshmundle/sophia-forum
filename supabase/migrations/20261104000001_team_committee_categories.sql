-- Sophia CMS · team committee categories (applied to sophia-cms-staging 2026-11-04, owner approved).
-- Adds five Team categories for the committee 2026-27 sections on /team: Finance & Treasury, Discipline Committee,
-- Women Cell, NSS and Sponsorship. Additive only: all 12 existing values stay valid, no row changes here, and the
-- constraint keeps its name (the API maps team_members_category_check errors to the Committee field).
-- Afterwards: node qa/cms-db/recategorise-committee-2026.mjs (dry run, then --apply) moves the 9 committee records.
-- Manual rollback: supabase/rollback/20261104000001_team_committee_categories.down.sql.
begin;

alter table public.team_members
  drop constraint team_members_category_check,
  add constraint team_members_category_check check (category in (
    'President', 'Vice President', 'Secretary', 'Joint Secretary', 'Technical Team',
    'Event Management Team', 'Social Media Team', 'Cultural Team', 'Promotional Team',
    'Documentation Team', 'Girls Representative', 'Sports Team',
    'Finance & Treasury', 'Discipline Committee', 'Women Cell', 'NSS', 'Sponsorship'));

commit;
