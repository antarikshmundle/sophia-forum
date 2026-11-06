-- Sophia CMS · 7c · storage bucket site-media and its policies (Admin photo uploads). No table changes:
-- team_members.photo, events.poster, gallery_items.url/thumbnail_url hold the object's public URL (migration 7b),
-- faculty.image_path holds the object path (migration 3). Supersedes the held migration 7 (faculty-photos only).
-- Objects: <module>/<record-id>/<uuid>.<jpg|png|webp>, module = faculty | team | events | gallery.
-- Read: public bucket, so published pages load images by URL (object names are random UUIDs; listing is admin-only).
-- Write/replace/delete: the admin only. Size and type are enforced by Storage itself: 5 MB; JPEG, PNG, WebP
-- (no SVG, GIF, HEIC or video files; gallery videos are YouTube links).
-- A plain insert (no ON CONFLICT): if a bucket with this id exists, the migration fails instead of silently keeping
-- different settings.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-media', 'site-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy site_media_admin_select on storage.objects
  for select to authenticated
  using (bucket_id = 'site-media' and (select public.app_role()) = 'admin');

create policy site_media_admin_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'site-media'
    and name ~ '^(faculty|team|events|gallery)/[a-z0-9]+(-[a-z0-9]+)*/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
    and (select public.app_role()) = 'admin'
  );

create policy site_media_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'site-media' and (select public.app_role()) = 'admin')
  with check (
    bucket_id = 'site-media'
    and name ~ '^(faculty|team|events|gallery)/[a-z0-9]+(-[a-z0-9]+)*/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
    and (select public.app_role()) = 'admin'
  );

create policy site_media_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'site-media' and (select public.app_role()) = 'admin');
