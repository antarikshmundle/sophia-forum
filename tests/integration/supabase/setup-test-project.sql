-- Tier 2 one-time setup of the disposable test project. Run ONLY through setup-test-project.ps1, which connects with
-- psql after verifying the connection's project ref (from the connection's own user/host + a successful login) equals
-- the ref you type, the ref in .env.integration.local and the allowlisted test ref. The values below come from that
-- script's child-process environment; run any other way (e.g. in the SQL Editor) the script refuses.
\set ON_ERROR_STOP on
\getenv connected_ref SOPHIA_T2_REF
\getenv admin_email SOPHIA_T2_ADMIN_EMAIL
\getenv manager_email SOPHIA_T2_MANAGER_EMAIL
\getenv noprofile_email SOPHIA_T2_NOPROFILE_EMAIL
\if :{?connected_ref}
\else
do $$ begin raise exception 'REFUSED: run this only through setup-test-project.ps1 (no verified connection ref).'; end $$;
\endif
\if :{?admin_email}
\else
do $$ begin raise exception 'REFUSED: test user emails missing; run this only through setup-test-project.ps1.'; end $$;
\endif
\if :{?manager_email}
\else
do $$ begin raise exception 'REFUSED: test user emails missing; run this only through setup-test-project.ps1.'; end $$;
\endif
\if :{?noprofile_email}
\else
do $$ begin raise exception 'REFUSED: test user emails missing; run this only through setup-test-project.ps1.'; end $$;
\endif

begin;

create temporary table tier2_setup on commit drop as
select :'connected_ref'::text as connected_ref,
       lower(:'admin_email')::text as admin_email,
       lower(:'manager_email')::text as manager_email,
       lower(:'noprofile_email')::text as noprofile_email;

do $$
declare
  s record;
  existing text;   -- not public.app_role: that type doesn't exist before the migrations, and that case must reach its own check
begin
  select * into s from tier2_setup;
  if s.connected_ref !~ '^[a-z0-9]{20}$' then raise exception 'REFUSED: invalid connected project ref.'; end if;
  if s.connected_ref in ('mqvhuvtakzrnvuvkkgyt', 'mcbsxthyjmptrgfppbsa') then raise exception 'REFUSED: connected to the staging or production project.'; end if;
  if to_regclass('public.site_content') is null or to_regclass('public.profiles') is null then
    raise exception 'REFUSED: the CMS migrations are not applied here (run push-migrations.ps1 first).';
  end if;
  -- a fresh test project holds no CMS records (an extra safeguard; identity comes from the verified connection)
  if exists (select 1 from public.team_members) or exists (select 1 from public.events)
     or exists (select 1 from public.faculty) or exists (select 1 from public.gallery_items) then
    raise exception 'REFUSED: this database already contains CMS records. Setup runs only in the empty test project.';
  end if;
  if exists (select 1 from public.site_content where id = 'meta.integration') then
    raise exception 'Already set up (the marker row exists). Nothing changed.';
  end if;
  if (select count(distinct lower(email)) from auth.users where lower(email) in (s.admin_email, s.manager_email, s.noprofile_email)) <> 3 then
    raise exception 'Create the three test users first (Auth -> Users -> Add user, Auto Confirm User) with the emails in .env.integration.local.';
  end if;
  -- L3: an existing profile with an unexpected role is an error, never silently kept
  select p.role::text into existing from public.profiles p join auth.users u on u.id = p.user_id where lower(u.email) = s.admin_email;
  if found and existing <> 'admin' then raise exception 'REFUSED: the admin test user already has the role %, expected admin.', existing; end if;
  select p.role::text into existing from public.profiles p join auth.users u on u.id = p.user_id where lower(u.email) = s.manager_email;
  if found and existing <> 'manager' then raise exception 'REFUSED: the manager test user already has the role %, expected manager.', existing; end if;
  if exists (select 1 from public.profiles p join auth.users u on u.id = p.user_id where lower(u.email) = s.noprofile_email) then
    raise exception 'REFUSED: the no-profile test user must not have a profile.';
  end if;
end $$;

insert into public.profiles (user_id, display_name, role)
select u.id, 'Integration Admin', 'admin' from auth.users u, tier2_setup s
where lower(u.email) = s.admin_email and not exists (select 1 from public.profiles p where p.user_id = u.id);

insert into public.profiles (user_id, display_name, role)
select u.id, 'Integration Manager', 'manager' from auth.users u, tier2_setup s
where lower(u.email) = s.manager_email and not exists (select 1 from public.profiles p where p.user_id = u.id);

-- the marker carries the ref of the VERIFIED connection (not a typed value)
insert into public.site_content (id, data)
select 'meta.integration', jsonb_build_object('project', 'sophia-cms-integration', 'ref', s.connected_ref) from tier2_setup s;

select 'test profiles' as item, count(*)::text as value
  from public.profiles p join auth.users u on u.id = p.user_id, tier2_setup s
 where lower(u.email) in (s.admin_email, s.manager_email)
union all
select 'marker', (select data::text from public.site_content where id = 'meta.integration');

commit;
