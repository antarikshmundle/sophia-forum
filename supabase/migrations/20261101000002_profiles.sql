-- Sophia CMS P1 · 2/7 · profiles (role per auth user) and app_role().
-- Rows are created by the project owner in the SQL editor; no API role may insert, update or delete them,
-- so nobody can grant themselves a role.

create table public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(trim(display_name)) > 0),
  role         public.app_role not null,
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;

create policy profiles_self_read on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

-- The caller's role, or null when there is no profile row (null = no access in every policy).
create function public.app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.user_id = auth.uid()
$$;

revoke execute on function public.app_role() from public, anon;
grant execute on function public.app_role() to authenticated;
