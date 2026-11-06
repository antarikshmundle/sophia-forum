-- ROLLBACK of 20261105000001 (site-media upload limit): restores the 5 MB bucket limit of migration 7c.
-- Only meaningful together with MAX_MEDIA_BYTES back at 5 MB in src/lib/cms/media-path.ts (and a host that accepts
-- request bodies over 5 MB). Then: npx supabase@2.122.0 migration repair --status reverted 20261105000001

update storage.buckets set file_size_limit = 5242880 where id = 'site-media';
