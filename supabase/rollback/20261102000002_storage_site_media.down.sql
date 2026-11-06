-- ROLLBACK of 7c (storage site-media). STAGING ONLY unless separately approved.
-- Removes the four policies, so nobody can upload, replace or delete files any more (public reads keep working).
-- It does NOT remove the bucket or its files: Supabase refuses direct SQL deletes on storage tables. After a file
-- backup (qa/cms-db/backup-staging.mjs), the owner removes the bucket through Storage itself:
--   Dashboard → Storage → site-media → empty the bucket, then delete it.
-- Records that still point at deleted files then show the initials placeholder (FallbackImage).
-- Then: npx supabase@2.122.0 migration repair --status reverted 20261102000002

drop policy if exists site_media_admin_select on storage.objects;
drop policy if exists site_media_admin_insert on storage.objects;
drop policy if exists site_media_admin_update on storage.objects;
drop policy if exists site_media_admin_delete on storage.objects;
