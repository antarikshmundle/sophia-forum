import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiResult } from "./faculty";
import { CONTENT_MEDIA, MAX_MEDIA_BYTES, MEDIA_BUCKET, MEDIA_OBJECT as OBJECT, MEDIA_TOO_LARGE, mediaBaseUrl, mediaPath, publicMediaUrl } from "./media-path";

export { CONTENT_MEDIA, MAX_MEDIA_BYTES, MEDIA_BUCKET, MEDIA_TOO_LARGE, mediaBaseUrl, mediaPath, publicMediaUrl };

/**
 * Admin photo uploads (bucket site-media, migration 7c). Objects are named <module>/<record-id>/<uuid>.<ext>; each
 * record only ever references files in its own folder, so a folder can be pruned safely after a save: files the
 * record no longer references (replaced, removed or abandoned uploads) are deleted, referenced files never are.
 * All storage calls run as the signed-in admin, so the storage policies apply as well.
 */

export const MEDIA_MODULES = ["faculty", "team", "events", "gallery"] as const;
export type MediaModule = (typeof MEDIA_MODULES)[number];

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** True when url is one of our media files in this record's own folder. */
export function isOwnMedia(url: string, module: MediaModule, recordId: string): boolean {
  const path = mediaPath(url);
  return !!path && path.startsWith(`${module}/${recordId}/`);
}

/** The real image type from the file's first bytes (never the name or the browser's claim). */
function sniff(bytes: Uint8Array): { ext: "jpg" | "png" | "webp"; type: string } | null {
  const b = (i: number) => bytes[i];
  if (bytes.length >= 3 && b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return { ext: "jpg", type: "image/jpeg" };
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b(i) === v)) return { ext: "png", type: "image/png" };
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { ext: "webp", type: "image/webp" };
  return null;
}

const fail = (status: number, error: string, errors?: Record<string, string>): ApiResult => ({ status, body: errors ? { error, errors } : { error } });

/** Validates and stores one uploaded image as the admin; returns its public URL. */
export async function uploadMedia(client: SupabaseClient, module: string, recordId: string, file: unknown): Promise<ApiResult> {
  if (!MEDIA_MODULES.includes(module as MediaModule)) return fail(400, "Unknown upload area.");
  if (!SLUG.test(recordId) || recordId.length > 100) return fail(400, "Enter the record's ID or name before uploading.");
  if (!(file instanceof File)) return fail(400, "Choose an image file.");
  if (file.size === 0) return fail(400, "The file is empty.");
  if (file.size > MAX_MEDIA_BYTES) return fail(413, MEDIA_TOO_LARGE);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(bytes);
  if (!kind) return fail(400, "Upload a JPEG, PNG or WebP image.");
  const path = `${module}/${recordId}/${randomUUID()}.${kind.ext}`;
  // 1 hour: public copies are cached by the CDN and browsers, so a removed photo (e.g. consent withdrawn) stops being
  // served within the hour; names are random UUIDs, so a new photo never reuses a cached URL
  const r = await client.storage.from(MEDIA_BUCKET).upload(path, bytes, { contentType: kind.type, upsert: false, cacheControl: "3600" });
  if (r.error) {
    const msg = r.error.message ?? "";
    if (/row-level security|unauthorized|403/i.test(msg)) return fail(403, "Admin access required.");
    if (/exceeded|too large|413/i.test(msg)) return fail(413, MEDIA_TOO_LARGE);
    if (/mime|type/i.test(msg)) return fail(400, "Upload a JPEG, PNG or WebP image.");
    console.error(`[cms] media upload failed: ${msg.slice(0, 120)}`);
    return fail(500, "The upload failed. Please try again.");
  }
  const url = publicMediaUrl(path);
  return { status: 201, body: { data: { url, path } } };
}

/** Deletes the files in <module>/<recordId>/ that are not in keep (object paths). Failures are logged, never thrown. */
export async function pruneMedia(client: SupabaseClient, module: MediaModule, recordId: string, keep: string[]): Promise<void> {
  if (!SLUG.test(recordId)) return;
  try {
    const folder = `${module}/${recordId}`;
    const listed = await client.storage.from(MEDIA_BUCKET).list(folder, { limit: 1000 });
    if (listed.error) throw new Error(listed.error.message);
    const stale = (listed.data ?? []).map((o) => `${folder}/${o.name}`).filter((p) => OBJECT.test(p) && !keep.includes(p));
    if (stale.length) {
      const removed = await client.storage.from(MEDIA_BUCKET).remove(stale);
      if (removed.error) throw new Error(removed.error.message);
    }
  } catch (e) {
    console.error(`[cms] media clean-up for ${module}/${recordId} failed: ${String((e as Error).message).slice(0, 120)}`);
  }
}

/** The object paths a stored record references (only our own media URLs / paths count). */
export function referencedMedia(values: unknown[]): string[] {
  return values.flatMap((v) => {
    if (typeof v !== "string" || !v) return [];
    if (OBJECT.test(v)) return [v];
    const p = mediaPath(v);
    return p ? [p] : [];
  });
}
