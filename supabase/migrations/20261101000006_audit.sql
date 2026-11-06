-- Sophia CMS P1 · 6/7 · audit log for faculty and hod_messages.
-- Decision D5: all entries are kept; no automatic retention limit.
-- Rows are written only by the security-definer trigger; API roles can read (admin) but never write.

create table public.audit_log (
  id         bigint generated always as identity primary key,
  table_name text not null,
  record_id  text not null,
  action     text not null check (action in ('insert', 'update', 'delete')),
  actor      uuid,                                   -- auth.uid() of the caller; null for owner/SQL-editor changes
  at         timestamptz not null default now(),
  before     jsonb,
  after      jsonb
);

create index audit_log_record on public.audit_log (table_name, record_id, at);

alter table public.audit_log enable row level security;

create policy audit_log_admin_read on public.audit_log
  for select to authenticated
  using ((select public.app_role()) = 'admin');

revoke all on table public.audit_log from anon, authenticated;
revoke all on sequence public.audit_log_id_seq from anon, authenticated;
grant select on table public.audit_log to authenticated;

create function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- separate branches: OLD is unset on INSERT and NEW on DELETE
  if tg_op = 'INSERT' then
    insert into public.audit_log (table_name, record_id, action, actor, before, after)
    values (tg_table_name, new.id::text, 'insert', auth.uid(), null, to_jsonb(new));
  elsif tg_op = 'UPDATE' then
    insert into public.audit_log (table_name, record_id, action, actor, before, after)
    values (tg_table_name, new.id::text, 'update', auth.uid(), to_jsonb(old), to_jsonb(new));
  else
    insert into public.audit_log (table_name, record_id, action, actor, before, after)
    values (tg_table_name, old.id::text, 'delete', auth.uid(), to_jsonb(old), null);
  end if;
  return null;
end;
$$;

revoke execute on function public.write_audit_log() from public, anon, authenticated;

create trigger faculty_audit
  after insert or update or delete on public.faculty
  for each row execute function public.write_audit_log();

create trigger hod_messages_audit
  after insert or update or delete on public.hod_messages
  for each row execute function public.write_audit_log();
