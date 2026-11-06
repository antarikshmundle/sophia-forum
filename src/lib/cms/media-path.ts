/**
 * Media object paths and public URLs (bucket site-media, migration 7c). Dependency-free, so pure modules
 * (faculty.ts, tests) can use it: objects are <module>/<record-id>/<uuid>.<jpg|png|webp>.
 */

export const MEDIA_BUCKET = "site-media";
/**
 * Largest accepted photo, shared by the Admin form, the upload API and the bucket's file_size_limit (migration
 * 20261105000001). 4 MB keeps the whole upload request below Vercel's ~4.5 MB serverless request-body limit.
 */
export const MAX_MEDIA_BYTES = 4 * 1024 * 1024;
export const MEDIA_TOO_LARGE = `The image is larger than ${MAX_MEDIA_BYTES / (1024 * 1024)} MB.`;
export const MEDIA_OBJECT = /^(faculty|team|events|gallery)\/([a-z0-9]+(?:-[a-z0-9]+)*)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

/** https://<project>.supabase.co/storage/v1/object/public/site-media/ (null when the project URL isn't configured). */
export function mediaBaseUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url)) return null;
  return `${url.replace(/\/$/, "")}/storage/v1/object/public/${MEDIA_BUCKET}/`;
}

/** The public URL of an object path, or "" (→ initials placeholder) for anything else. */
export function publicMediaUrl(path: string | null | undefined): string {
  const base = mediaBaseUrl();
  return path && base && MEDIA_OBJECT.test(path) ? base + path : "";
}

/** The object path of one of our media URLs, or null for anything else. */
export function mediaPath(url: string): string | null {
  const base = mediaBaseUrl();
  if (!base || !url.startsWith(base)) return null;
  const path = url.slice(base.length);
  return MEDIA_OBJECT.test(path) ? path : null;
}

/**
 * Admin → Content photo uploads (Home · About section) reuse the gallery area under a reserved record id: the storage
 * policies already allow gallery/<id>/, so no migration is needed. No Gallery record may use this id (the Gallery API
 * refuses it), so Gallery saves and deletions never prune this folder; Content saves do.
 */
export const CONTENT_MEDIA = { module: "gallery", recordId: "content-home-about" } as const;

/** Record ids no record of that collection may use (their media folder belongs to something else). */
export const RESERVED_RECORD_IDS: Partial<Record<"team" | "events" | "gallery", readonly string[]>> = { gallery: [CONTENT_MEDIA.recordId] };
export const RESERVED_ID_ERROR = "This ID is reserved for site content.";

/** True when url is one of our media files in the reserved Content folder. */
export function isContentMedia(url: string): boolean {
  return mediaPath(url)?.startsWith(`${CONTENT_MEDIA.module}/${CONTENT_MEDIA.recordId}/`) ?? false;
}
