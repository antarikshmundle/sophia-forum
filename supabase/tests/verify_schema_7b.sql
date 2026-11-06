-- READ-ONLY verification of migration 7b on sophia-cms-staging (paste into the SQL editor after `db push`).
-- Makes no changes. Every row should show ok = true.

with checks(name, ok) as (
  values
  ('the four tables exist with RLS enabled',
    (select count(*) = 4 and bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname in ('team_members', 'events', 'gallery_items', 'site_content'))),
  ('anon: SELECT only (no INSERT/UPDATE/DELETE) on all four',
    (select bool_and(not has_table_privilege('anon', 'public.' || t, 'INSERT') and not has_table_privilege('anon', 'public.' || t, 'UPDATE')
      and not has_table_privilege('anon', 'public.' || t, 'DELETE') and has_column_privilege('anon', 'public.' || t, 'id', 'SELECT'))
     from unnest(array['team_members', 'events', 'gallery_items', 'site_content']) t)),
  ('anon: cannot read updated_by',
    (select bool_and(not has_column_privilege('anon', 'public.' || t, 'updated_by', 'SELECT'))
     from unnest(array['team_members', 'events', 'gallery_items', 'site_content']) t)),
  ('authenticated: ids not updatable; site_content not deletable',
    (select bool_and(not has_column_privilege('authenticated', 'public.' || t, 'id', 'UPDATE'))
     from unnest(array['team_members', 'events', 'gallery_items', 'site_content']) t)
    and not has_table_privilege('authenticated', 'public.site_content', 'DELETE')),
  ('policies: 5 on team_members, events, gallery_items; 3 on site_content',
    (select count(*) from pg_policies where schemaname = 'public' and tablename = 'team_members') = 5
    and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'events') = 5
    and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'gallery_items') = 5
    and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'site_content') = 3),
  ('audit and updated-fields triggers on all four (8)',
    (select count(*) from pg_trigger where not tgisinternal and tgrelid in ('public.team_members'::regclass, 'public.events'::regclass,
      'public.gallery_items'::regclass, 'public.site_content'::regclass)) = 8),
  ('migrations 1–6 objects untouched (faculty, hod_messages, audit_log still present)',
    to_regclass('public.faculty') is not null and to_regclass('public.hod_messages') is not null and to_regclass('public.audit_log') is not null)
)
select name, ok from checks;
