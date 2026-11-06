-- Sophia CMS P1 · 1/7 · enum types and the shared row-stamp trigger function.
-- gen_random_uuid() is built into PostgreSQL 13+, so no extension is needed.

create type public.app_role as enum ('admin', 'manager');                       -- 'manager' reserved; no policy grants it anything
create type public.message_status as enum ('draft', 'approved', 'published', 'archived');

-- Stamps updated_at / updated_by on every write (created_at keeps its default).
create function public.set_updated_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

revoke execute on function public.set_updated_fields() from public, anon, authenticated;
