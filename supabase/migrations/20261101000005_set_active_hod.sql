-- Sophia CMS P1 · 5/7 · the only way to change faculty.is_active_hod.
-- Both functions run with owner rights (is_active_hod has no column grant for API roles), check the caller's
-- admin role themselves, and take a transaction-scoped advisory lock so concurrent calls run one after another:
-- every call then succeeds, the last one wins, and faculty_one_active_hod is never even approached.

create function public.set_active_hod(p_faculty_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select public.app_role()) is distinct from 'admin' then
    raise exception 'Only an admin can change the active HOD.' using errcode = '42501', hint = 'sophia:not_admin';
  end if;

  perform pg_advisory_xact_lock(hashtext('sophia.active_hod'));

  if not exists (select 1 from public.faculty f where f.id = p_faculty_id) then
    raise exception 'Faculty record % not found.', p_faculty_id using errcode = 'P0002', hint = 'sophia:not_found';
  end if;
  if not exists (select 1 from public.faculty f where f.id = p_faculty_id and f.is_published) then
    raise exception 'Only a published faculty record can be the active HOD.' using errcode = 'P0001', hint = 'sophia:hod_unpublished';
  end if;

  -- the previous HOD's published message is archived, never deleted
  update public.hod_messages set status = 'archived' where status = 'published' and faculty_id <> p_faculty_id;
  update public.faculty set is_active_hod = false where is_active_hod and id <> p_faculty_id;
  update public.faculty set is_active_hod = true where id = p_faculty_id and not is_active_hod;
end;
$$;

create function public.clear_active_hod()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select public.app_role()) is distinct from 'admin' then
    raise exception 'Only an admin can change the active HOD.' using errcode = '42501', hint = 'sophia:not_admin';
  end if;

  perform pg_advisory_xact_lock(hashtext('sophia.active_hod'));

  update public.hod_messages set status = 'archived' where status = 'published';
  update public.faculty set is_active_hod = false where is_active_hod;
end;
$$;

revoke execute on function public.set_active_hod(text) from public, anon;
revoke execute on function public.clear_active_hod() from public, anon;
grant execute on function public.set_active_hod(text) to authenticated;
grant execute on function public.clear_active_hod() to authenticated;
