-- ROLLBACK of 7b (team_members, events, gallery_items, site_content). STAGING ONLY unless separately approved.
-- Data loss: ALL team, event, gallery and site-content records (back them up first; audit_log entries are kept).
-- Then: npx supabase@2.122.0 migration repair --status reverted 20261102000001

drop table if exists public.site_content;            -- each drop removes the table's policies, indexes and triggers
drop table if exists public.gallery_items;
drop table if exists public.events;
drop table if exists public.team_members;
