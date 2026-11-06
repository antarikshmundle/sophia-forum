export interface GalleryMediaItem {
  id: string;
  title: string;
  category: "photo" | "video";
  event: string;
  year: number;
  url: string;
  thumbnailUrl?: string;
  isFeatured?: boolean;
}

/**
 * Built-in gallery media for the local demo mode (CMS_FACULTY_MODE unset). Intentionally empty: all Sophia Forum gallery media
 * is managed in the CMS (Admin → Gallery), and a production build is always a CMS backend build
 * (src/lib/build-env.ts). The former sample data of another site was removed in the Sophia Forum cleanup.
 */
export const GALLERY_HIGHLIGHTS: GalleryMediaItem[] = [];
export const GALLERY_PHOTOS: GalleryMediaItem[] = [];
export const STATIC_VIDEOS: GalleryMediaItem[] = [];
