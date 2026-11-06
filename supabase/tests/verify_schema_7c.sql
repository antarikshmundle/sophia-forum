-- READ-ONLY verification of migration 7c on sophia-cms-staging (paste into the SQL editor after `db push`).
-- Makes no changes. Every row should show ok = true.

with checks(name, ok) as (
  values
  ('bucket site-media: public read, 5 MB, JPEG/PNG/WebP only',
    exists (select 1 from storage.buckets where id = 'site-media' and public and file_size_limit = 5242880
      and allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'])),
  ('the four site-media policies exist on storage.objects',
    (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname in
      ('site_media_admin_select', 'site_media_admin_insert', 'site_media_admin_update', 'site_media_admin_delete')) = 4),
  ('all four policies are for authenticated only (no anon write policy)',
    (select bool_and(roles = '{authenticated}') from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'site_media_admin_%')),
  ('the held faculty-photos bucket was not created',
    not exists (select 1 from storage.buckets where id = 'faculty-photos'))
)
select name, ok from checks;
