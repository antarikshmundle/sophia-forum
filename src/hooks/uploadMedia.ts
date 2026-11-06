"use client";

import { slugify, type UploadResult } from "@/components/admin/CrudManager";
import { MAX_MEDIA_BYTES, MEDIA_TOO_LARGE } from "@/lib/cms/media-path";

export type MediaModule = "faculty" | "team" | "events" | "gallery";

/**
 * Uploads one photo for a record (Admin, CMS backend) to /api/admin/uploads. The file is filed under the record's
 * ID, or for a new record the ID its name will generate; it is used once the record is saved.
 */
const TOO_LARGE = MEDIA_TOO_LARGE;

export async function uploadMedia(module: MediaModule, recordId: string, file: File): Promise<UploadResult> {
  if (!recordId) return { ok: false, error: "Enter the name (or ID) first, so the photo can be filed with this record." };
  // checked before sending: an oversized file never leaves the browser
  if (file.size > MAX_MEDIA_BYTES) return { ok: false, error: TOO_LARGE };
  const form = new FormData();
  form.set("module", module);
  form.set("recordId", recordId);
  form.set("file", file);
  try {
    const r = await fetch("/api/admin/uploads", { method: "POST", credentials: "same-origin", cache: "no-store", body: form });
    const json = await r.json().catch(() => null);
    if (r.ok && typeof json?.data?.url === "string") return { ok: true, url: json.data.url };
    if (typeof json?.error === "string") return { ok: false, error: json.error };
    // a 413 without our JSON comes from the hosting platform's own request-size limit (e.g. ~4.5 MB on Vercel)
    if (r.status === 413) return { ok: false, error: `The image is too large to upload. Choose an image under ${MAX_MEDIA_BYTES / (1024 * 1024)} MB.` };
    return { ok: false, error: `Upload failed (${r.status}).` };
  } catch {
    return { ok: false, error: "Couldn't reach the server." };
  }
}

/** The folder for a draft: its ID, or the slug its title will generate (as CrudManager does on save). */
export const draftRecordId = (draft: Record<string, unknown>, titleField: string) =>
  String(draft.id ?? "").trim() || slugify(String(draft[titleField] ?? ""));
