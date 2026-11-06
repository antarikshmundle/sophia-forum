-- Sophia CMS P1 · 4/7 · HOD messages with approval and history.
-- Decision D2: a faculty record that has message history can't be deleted (ON DELETE RESTRICT).
-- Messages are never deleted through the API; they are archived.

create table public.hod_messages (
  id          uuid primary key default gen_random_uuid(),
  faculty_id  text not null references public.faculty (id) on delete restrict,
  message     text not null check (length(trim(message)) > 0),
  status      public.message_status not null default 'draft',
  approved_by text,                                                   -- who confirmed the wording is the HOD's own
  approved_on date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid() references auth.users (id) on delete set null,
  constraint hod_messages_approval_required check (
    status in ('draft', 'archived')
    or (length(trim(coalesce(approved_by, ''))) > 0 and approved_on is not null)
  )
);

-- At most one published message.
create unique index hod_messages_one_published on public.hod_messages ((true)) where status = 'published';
create index hod_messages_faculty on public.hod_messages (faculty_id);

create trigger hod_messages_set_updated_fields
  before update on public.hod_messages
  for each row execute function public.set_updated_fields();

-- A message can only be published for the current, published active HOD.
create function public.hod_messages_guard_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'published' and not exists (
    select 1 from public.faculty f where f.id = new.faculty_id and f.is_active_hod and f.is_published
  ) then
    raise exception 'Only a message of the current, published active HOD can be published.'
      using errcode = 'P0001', hint = 'sophia:publish_not_active_hod';
  end if;
  return new;
end;
$$;

revoke execute on function public.hod_messages_guard_publish() from public, anon, authenticated;

create trigger hod_messages_guard_publish
  before insert or update on public.hod_messages
  for each row execute function public.hod_messages_guard_publish();

alter table public.hod_messages enable row level security;

create policy hod_messages_public_read on public.hod_messages
  for select to anon, authenticated
  using (status = 'published');

create policy hod_messages_admin_read on public.hod_messages
  for select to authenticated
  using ((select public.app_role()) = 'admin');

create policy hod_messages_admin_insert on public.hod_messages
  for insert to authenticated
  with check ((select public.app_role()) = 'admin');

create policy hod_messages_admin_update on public.hod_messages
  for update to authenticated
  using ((select public.app_role()) = 'admin')
  with check ((select public.app_role()) = 'admin');

-- No delete policy and no delete grant. faculty_id can't be changed after insert.
-- The public key may read only what the public card shows: never the approver or updated_by.
revoke all on table public.hod_messages from anon, authenticated;
grant select (id, faculty_id, message, status) on table public.hod_messages to anon;
grant select on table public.hod_messages to authenticated;
grant insert (faculty_id, message, status, approved_by, approved_on) on table public.hod_messages to authenticated;
grant update (message, status, approved_by, approved_on) on table public.hod_messages to authenticated;
