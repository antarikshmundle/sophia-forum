-- READ-ONLY schema verification for sophia-cms-staging (paste into the SQL editor after applying migrations).
-- Makes no changes. Every row should show ok = true.

with checks(name, ok) as (
  values
  -- RLS enabled on every CMS table
  ('RLS enabled on profiles, faculty, hod_messages, audit_log',
    (select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname in ('profiles', 'faculty', 'hod_messages', 'audit_log'))
    and (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname in ('profiles', 'faculty', 'hod_messages', 'audit_log')) = 4),
  -- table privileges of the API roles
  ('anon: SELECT only on faculty and hod_messages; nothing on profiles and audit_log',
    has_column_privilege('anon', 'public.faculty', 'name', 'SELECT') and has_column_privilege('anon', 'public.hod_messages', 'message', 'SELECT')
    and not has_table_privilege('anon', 'public.faculty', 'INSERT') and not has_table_privilege('anon', 'public.faculty', 'UPDATE')
    and not has_table_privilege('anon', 'public.faculty', 'DELETE') and not has_table_privilege('anon', 'public.hod_messages', 'INSERT')
    and not has_table_privilege('anon', 'public.profiles', 'SELECT') and not has_table_privilege('anon', 'public.audit_log', 'SELECT')),
  ('anon: cannot read image_consent, updated_by, approved_by, approved_on',
    not has_column_privilege('anon', 'public.faculty', 'image_consent', 'SELECT') and not has_column_privilege('anon', 'public.faculty', 'updated_by', 'SELECT')
    and not has_column_privilege('anon', 'public.hod_messages', 'approved_by', 'SELECT') and not has_column_privilege('anon', 'public.hod_messages', 'approved_on', 'SELECT')
    and not has_any_column_privilege('anon', 'public.faculty', 'UPDATE') and not has_any_column_privilege('anon', 'public.hod_messages', 'UPDATE')),
  ('authenticated: no write privileges on profiles and audit_log',
    not has_table_privilege('authenticated', 'public.profiles', 'INSERT') and not has_table_privilege('authenticated', 'public.profiles', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.profiles', 'DELETE') and not has_table_privilege('authenticated', 'public.audit_log', 'INSERT')
    and not has_table_privilege('authenticated', 'public.audit_log', 'UPDATE') and not has_table_privilege('authenticated', 'public.audit_log', 'DELETE')),
  ('authenticated: is_active_hod not insertable/updatable; faculty.id not updatable',
    not has_column_privilege('authenticated', 'public.faculty', 'is_active_hod', 'INSERT')
    and not has_column_privilege('authenticated', 'public.faculty', 'is_active_hod', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.faculty', 'id', 'UPDATE')
    and has_column_privilege('authenticated', 'public.faculty', 'name', 'UPDATE')),
  ('authenticated: hod_messages not deletable; faculty_id not updatable',
    not has_table_privilege('authenticated', 'public.hod_messages', 'DELETE')
    and not has_column_privilege('authenticated', 'public.hod_messages', 'faculty_id', 'UPDATE')),
  -- functions
  ('set_active_hod / clear_active_hod: executable by authenticated, not by anon',
    has_function_privilege('authenticated', 'public.set_active_hod(text)', 'EXECUTE') and not has_function_privilege('anon', 'public.set_active_hod(text)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.clear_active_hod()', 'EXECUTE') and not has_function_privilege('anon', 'public.clear_active_hod()', 'EXECUTE')),
  ('app_role(): not executable by anon',
    not has_function_privilege('anon', 'public.app_role()', 'EXECUTE')),
  ('trigger functions: not executable by anon or authenticated',
    not has_function_privilege('anon', 'public.write_audit_log()', 'EXECUTE') and not has_function_privilege('authenticated', 'public.write_audit_log()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.set_updated_fields()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.faculty_guard_active_hod()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.hod_messages_guard_publish()', 'EXECUTE')),
  ('every SECURITY DEFINER function in public pins search_path',
    (select bool_and(coalesce(array_to_string(p.proconfig, ',') like '%search_path=%', false))
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef)),
  -- indexes and constraints
  ('unique partial index faculty_one_active_hod exists',
    exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'faculty_one_active_hod' and indexdef ilike '%unique%where is_active_hod%')),
  ('unique partial index hod_messages_one_published exists',
    exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'hod_messages_one_published' and indexdef ilike '%unique%')),
  ('hod_messages.faculty_id is ON DELETE RESTRICT (D2)',
    exists (select 1 from pg_constraint where conrelid = 'public.hod_messages'::regclass and contype = 'f' and confdeltype = 'r')),
  ('at most one active HOD right now',
    (select count(*) from public.faculty where is_active_hod) <= 1),
  -- storage (only meaningful after migration 7)
  ('storage bucket faculty-photos: public, 2 MB, JPEG/PNG/WebP (after migration 7)',
    coalesce((select public and file_size_limit = 2097152 and allowed_mime_types @> array['image/jpeg', 'image/png', 'image/webp']
      and cardinality(allowed_mime_types) = 3 from storage.buckets where id = 'faculty-photos'), false)),
  ('four faculty_photos_admin_* policies on storage.objects (after migration 7)',
    (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'faculty_photos_admin_%') = 4)
)
select name, ok from checks;
