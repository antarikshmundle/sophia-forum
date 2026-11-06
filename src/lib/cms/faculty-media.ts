import type { SupabaseClient } from "@supabase/supabase-js";
import { isOwnMedia, mediaPath, pruneMedia, referencedMedia } from "./media";

/** Faculty photos (site-media, folder faculty/<id>/): the record stores the object path in image_path. */

export const facultyPhotoPath = (url: string, id: string): string | null => (isOwnMedia(url, "faculty", id) ? mediaPath(url) : null);

/** After a successful save or delete: remove files in the record's folder that it no longer references. */
export async function syncFacultyMedia(client: SupabaseClient, id: string, record: { image: string } | null): Promise<void> {
  await pruneMedia(client, "faculty", id, record ? referencedMedia([record.image]) : []);
}
