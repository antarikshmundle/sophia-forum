import { STATIC_EVENTS, type EventItem } from "@/data/staticEvents";
import { STATIC_TEAM, type TeamMember } from "@/data/staticTeam";
import { GALLERY_HIGHLIGHTS, GALLERY_PHOTOS, STATIC_VIDEOS, type GalleryMediaItem } from "@/data/staticGallery";
import { publicFromBackend, publishedContent, publishedRecords } from "@/lib/cms/public";
import type { StoredContent } from "@/data/siteContent";

/**
 * Server-side data source for the public pages. Demo mode (default): the built-in datasets, exactly as before
 * (pages stay prerendered). CMS backend mode: the published records managed in Admin, read per request; a failed
 * read is returned as { ok: false } so the page shows an error state, never the built-in data.
 */

export type Loaded<T> = { ok: true; data: T } | { ok: false };

export async function loadTeam(): Promise<Loaded<TeamMember[]>> {
  if (!publicFromBackend()) return { ok: true, data: STATIC_TEAM };
  const r = await publishedRecords("team");
  return r.ok ? { ok: true, data: r.data as unknown as TeamMember[] } : r;
}

export async function loadMember(id: string): Promise<Loaded<TeamMember | undefined>> {
  if (!publicFromBackend()) return { ok: true, data: STATIC_TEAM.find((m) => m.id === id) };
  const r = await publishedRecords("team", id);
  return r.ok ? { ok: true, data: r.data[0] as unknown as TeamMember | undefined } : r;
}

export async function loadEvents(): Promise<Loaded<EventItem[]>> {
  if (!publicFromBackend()) return { ok: true, data: STATIC_EVENTS };
  const r = await publishedRecords("events");
  return r.ok ? { ok: true, data: r.data as unknown as EventItem[] } : r;
}

export async function loadEvent(id: string): Promise<Loaded<EventItem | undefined>> {
  if (!publicFromBackend()) return { ok: true, data: STATIC_EVENTS.find((e) => e.id === id) };
  const r = await publishedRecords("events", id);
  return r.ok ? { ok: true, data: r.data[0] as unknown as EventItem | undefined } : r;
}

export interface GalleryData {
  photos: GalleryMediaItem[];
  videos: GalleryMediaItem[];
  /** Home "Gallery highlights": the built-in three, or the featured published photos. */
  highlights: GalleryMediaItem[];
}

export async function loadGallery(): Promise<Loaded<GalleryData>> {
  if (!publicFromBackend()) return { ok: true, data: { photos: GALLERY_PHOTOS, videos: STATIC_VIDEOS, highlights: GALLERY_HIGHLIGHTS } };
  const r = await publishedRecords("gallery");
  if (!r.ok) return r;
  const items = r.data as unknown as GalleryMediaItem[];
  const photos = items.filter((i) => i.category === "photo");
  return { ok: true, data: { photos, videos: items.filter((i) => i.category === "video"), highlights: photos.filter((p) => p.isFeatured) } };
}

/**
 * Edited page text (Admin → Content). Demo mode: none (the built-in text). Backend mode: the stored sections over
 * the built-in text. The built-in text is the site's own default copy (not demo records); if the read fails the
 * page keeps that default copy and the failure is logged on the server.
 */
export async function loadContent(): Promise<StoredContent | undefined> {
  if (!publicFromBackend()) return undefined;
  const r = await publishedContent();
  return r.ok ? r.data : undefined;
}
