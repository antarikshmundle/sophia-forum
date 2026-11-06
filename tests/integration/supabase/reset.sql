-- Tier 2 FULL TEST-PROJECT RESET. Never automatic: run only through reset-test-project.ps1, which verifies the
-- connection's project ref and passes it (and the integration admin's email) in its child-process environment.
-- Run any other way the script refuses.
--
-- Default: PREVIEW. Everything runs in one transaction that is ROLLED BACK and only the counts are shown.
-- Apply: reset-test-project.ps1 -Apply (passes psql -v apply=1); any other apply value is refused.
--
-- What it removes — only records demonstrably created by Tier 2 (H2, M1):
--   a record is "owned" when its audit history has an insert by the integration admin and NO entry by anyone else
--   (other users, or the owner/SQL, whose actor is null). Mixed or foreign histories are never touched. In addition,
--   team/events/gallery/faculty IDs must match the run-ID pattern ^it-[0-9]{12}-[0-9a-f]{4}- and HOD messages must
--   belong to such a faculty record. Owned site_content rows (sections written only by Tier 2) are removed too; the
--   marker row (written by setup as the owner) never is.
--   A faculty record is removed only if every one of its messages is also owned and removed; if it holds the HOD
--   flag, only that flag is cleared first. Audit rows are removed only for the records removed here.
-- Users, profiles, the marker and every unrelated row and audit entry stay. Storage files can't be deleted with SQL;
-- the last query lists run-pattern objects that remain.
\set ON_ERROR_STOP on
\getenv connected_ref SOPHIA_T2_REF
\getenv admin_email SOPHIA_T2_ADMIN_EMAIL
\if :{?connected_ref}
\else
do $$ begin raise exception 'REFUSED: run this only through reset-test-project.ps1 (no verified connection ref).'; end $$;
\endif
\if :{?admin_email}
\else
do $$ begin raise exception 'REFUSED: integration admin email missing; run this only through reset-test-project.ps1.'; end $$;
\endif
\if :{?apply}
select (:'apply' = '1') as tier2_apply_ok \gset
\if :tier2_apply_ok
\set tier2_commit 1
\else
do $$ begin raise exception 'REFUSED: apply must be exactly 1 (omit it for a preview).'; end $$;
\endif
\endif

begin;

create temporary table tier2_ctx on commit drop as
select :'connected_ref'::text as connected_ref, lower(:'admin_email')::text as admin_email;

do $$
declare
  c record;
begin
  select * into c from tier2_ctx;
  if c.connected_ref !~ '^[a-z0-9]{20}$' then raise exception 'REFUSED: invalid connected project ref.'; end if;
  if c.connected_ref in ('mqvhuvtakzrnvuvkkgyt', 'mcbsxthyjmptrgfppbsa') then raise exception 'REFUSED: connected to the staging or production project.'; end if;
  if not exists (select 1 from public.site_content where id = 'meta.integration'
                 and data->>'project' = 'sophia-cms-integration' and data->>'ref' = c.connected_ref) then
    raise exception 'REFUSED: no Tier 2 marker for the connected project % here.', c.connected_ref;
  end if;
  if (select count(*) from auth.users u join public.profiles p on p.user_id = u.id
      where lower(u.email) = c.admin_email and p.role = 'admin') <> 1 then
    raise exception 'REFUSED: the integration admin (from .env.integration.local) is not an admin here.';
  end if;
end $$;

create temporary table tier2_admin on commit drop as
select u.id from auth.users u, tier2_ctx c where lower(u.email) = c.admin_email;

-- every record whose whole audit history is the integration admin's, with an insert among it
create temporary table tier2_owned on commit drop as
select a.table_name, a.record_id
  from public.audit_log a
 where a.table_name in ('team_members', 'events', 'gallery_items', 'faculty', 'hod_messages', 'site_content')
 group by a.table_name, a.record_id
having bool_and(a.actor is not distinct from (select id from tier2_admin))
   and bool_or(a.action = 'insert');

create temporary table tier2_plan (table_name text, record_id text) on commit drop;

insert into tier2_plan
select o.table_name, o.record_id from tier2_owned o
 where o.table_name in ('team_members', 'events', 'gallery_items', 'faculty')
   and o.record_id ~ '^it-[0-9]{12}-[0-9a-f]{4}-';

-- HOD messages: owned, of an owned run-pattern faculty record
insert into tier2_plan
select 'hod_messages', m.id::text from public.hod_messages m
  join tier2_owned o on o.table_name = 'hod_messages' and o.record_id = m.id::text
 where m.faculty_id in (select record_id from tier2_plan where table_name = 'faculty');

-- a faculty record with any message we don't remove can't be removed (and isn't touched)
delete from tier2_plan p
 where p.table_name = 'faculty'
   and exists (select 1 from public.hod_messages m where m.faculty_id = p.record_id
               and m.id::text not in (select record_id from tier2_plan where table_name = 'hod_messages'));

insert into tier2_plan
select o.table_name, o.record_id from tier2_owned o
 where o.table_name = 'site_content' and o.record_id <> 'meta.integration';

create temporary table tier2_reset (step text, rows_affected bigint) on commit drop;

with d as (delete from public.hod_messages where id::text in (select record_id from tier2_plan where table_name = 'hod_messages') returning 1)
insert into tier2_reset select '1 hod_messages', count(*) from d;
with u as (update public.faculty set is_active_hod = false
            where is_active_hod and id in (select record_id from tier2_plan where table_name = 'faculty') returning 1)
insert into tier2_reset select '2 HOD flag cleared (removed records only)', count(*) from u;
with d as (delete from public.faculty where id in (select record_id from tier2_plan where table_name = 'faculty') returning 1)
insert into tier2_reset select '3 faculty', count(*) from d;
with d as (delete from public.team_members where id in (select record_id from tier2_plan where table_name = 'team_members') returning 1)
insert into tier2_reset select '4 team_members', count(*) from d;
with d as (delete from public.events where id in (select record_id from tier2_plan where table_name = 'events') returning 1)
insert into tier2_reset select '5 events', count(*) from d;
with d as (delete from public.gallery_items where id in (select record_id from tier2_plan where table_name = 'gallery_items') returning 1)
insert into tier2_reset select '6 gallery_items', count(*) from d;
with d as (delete from public.site_content where id in (select record_id from tier2_plan where table_name = 'site_content') and id <> 'meta.integration' returning 1)
insert into tier2_reset select '7 site_content', count(*) from d;
-- last, so the audit rows written by the deletes above go too; only for the records removed here
with d as (delete from public.audit_log a using tier2_plan p where a.table_name = p.table_name and a.record_id = p.record_id returning 1)
insert into tier2_reset select '8 audit_log (removed records only)', count(*) from d;

select step, rows_affected from tier2_reset order by step;

select 'kept: owned-looking records with mixed or foreign history' as note, count(*) as records
  from (select table_name, record_id from public.audit_log
         where record_id ~ '^it-[0-9]{12}-[0-9a-f]{4}-' group by 1, 2) r
 where (r.table_name, r.record_id) not in (select table_name, record_id from tier2_plan);

select bucket_id, name from storage.objects
 where bucket_id = 'site-media' and name ~ '^(faculty|team|events|gallery)/it-[0-9]{12}-[0-9a-f]{4}-' order by name;

\if :{?tier2_commit}
commit;
\echo 'APPLIED: the counts above were committed.'
\else
rollback;
\echo 'PREVIEW ONLY: everything above was rolled back. Re-run with -Apply to commit.'
\endif
