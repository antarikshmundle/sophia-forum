-- Sophia CMS · site-media upload limit 5 MB → 4 MB (Vercel compatibility; owner approved 2026-11-05).
-- Vercel serverless functions accept request bodies up to about 4.5 MB, so an upload of a 4.5–5 MB photo would be cut
-- off by the platform before the API could answer. The app now accepts at most 4 MB (src/lib/cms/media-path.ts
-- MAX_MEDIA_BYTES); this makes Storage enforce the same limit for every upload path.
-- Scope: only storage.buckets.file_size_limit of 'site-media'. Public access, allowed types, policies and every
-- existing file stay as they are (the limit applies to new uploads; files already stored are never removed).
-- Safe to re-apply (it sets the same value). Refuses — instead of silently doing nothing — if the bucket is missing.
-- Manual rollback: supabase/rollback/20261105000001_site_media_4mb_limit.down.sql.

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'site-media') then
    raise exception 'site-media bucket not found: apply 20261102000002_storage_site_media first.';
  end if;
end $$;

update storage.buckets set file_size_limit = 4194304 where id = 'site-media';
