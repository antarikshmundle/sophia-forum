-- Sophia CMS P1 · 3/7 · faculty, the single-active-HOD invariant, guards, RLS and column grants.

create table public.faculty (
  id            text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),        -- same rule as CrudManager SLUG_PATTERN
  name          text not null check (length(trim(name)) > 0),
  designation   text not null check (length(trim(designation)) > 0),
  department    text not null default 'Artificial Intelligence & Data Science' check (length(trim(department)) > 0),
  image_path    text,                                                             -- storage object path; null → initials
  image_consent text,                                                             -- where permission for the photo came from
  linkedin      text check (linkedin is null or linkedin ~ '^https://[^\s]+$'),
  quote         text check (quote is null or length(trim(quote)) > 0),           -- only a person's own approved words
  sort_order    integer not null check (sort_order >= 0),
  is_published  boolean not null default false,
  is_active_hod boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid default auth.uid() references auth.users (id) on delete set null,
  constraint faculty_image_path_format check (
    image_path is null
    or (image_path ~ '^faculty/[a-z0-9]+(-[a-z0-9]+)*/[0-9a-f-]{36}\.(jpg|png|webp)$'
        and image_path like 'faculty/' || id || '/%')
  ),
  constraint faculty_image_needs_consent check (image_path is null or length(trim(coalesce(image_consent, ''))) > 0)
);

-- At most one active HOD, guaranteed by the database even under concurrent writes.
create unique index faculty_one_active_hod on public.faculty ((true)) where is_active_hod;
create index faculty_published_order on public.faculty (is_published, sort_order);

create trigger faculty_set_updated_fields
  before update on public.faculty
  for each row execute function public.set_updated_fields();

-- The active HOD can't be deleted or unpublished; assign another HOD (or clear the HOD) first.
create function public.faculty_guard_active_hod()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_active_hod then
      raise exception 'The active HOD cannot be deleted. Assign another HOD or clear the HOD first.'
        using errcode = 'P0001', hint = 'sophia:active_hod_delete';
    end if;
    return old;
  end if;
  -- UPDATE
  if old.is_active_hod and new.is_active_hod and not new.is_published then
    raise exception 'The active HOD must stay published. Assign another HOD or clear the HOD first.'
      using errcode = 'P0001', hint = 'sophia:active_hod_unpublish';
  end if;
  return new;
end;
$$;

revoke execute on function public.faculty_guard_active_hod() from public, anon, authenticated;

create trigger faculty_guard_active_hod
  before update or delete on public.faculty
  for each row execute function public.faculty_guard_active_hod();

-- RLS: enabled in the same migration that creates the table.
alter table public.faculty enable row level security;

create policy faculty_public_read on public.faculty
  for select to anon, authenticated
  using (is_published);

create policy faculty_admin_read on public.faculty
  for select to authenticated
  using ((select public.app_role()) = 'admin');

create policy faculty_admin_insert on public.faculty
  for insert to authenticated
  with check ((select public.app_role()) = 'admin');

create policy faculty_admin_update on public.faculty
  for update to authenticated
  using ((select public.app_role()) = 'admin')
  with check ((select public.app_role()) = 'admin');

create policy faculty_admin_delete on public.faculty
  for delete to authenticated
  using ((select public.app_role()) = 'admin');

-- Explicit grants. is_active_hod is in neither write list, so it can only change through
-- set_active_hod() / clear_active_hod() (migration 5). id is insert-only (the slug is create-only in the UI).
-- The public key may read only the columns the public site shows: never image_consent or updated_by.
revoke all on table public.faculty from anon, authenticated;
grant select (id, name, designation, department, image_path, linkedin, quote, sort_order, is_published, is_active_hod)
  on table public.faculty to anon;
grant select on table public.faculty to authenticated;
grant insert (id, name, designation, department, image_path, image_consent, linkedin, quote, sort_order, is_published)
  on table public.faculty to authenticated;
grant update (name, designation, department, image_path, image_consent, linkedin, quote, sort_order, is_published)
  on table public.faculty to authenticated;
grant delete on table public.faculty to authenticated;
