export interface EventItem {
  id: string;
  name: string;
  date: string;
  time: string;
  venue: string;
  description: string;
  poster: string;
  status: "upcoming" | "past" | "completed";
  registrationLink?: string;
  galleryId?: string;
  isFeatured?: boolean;
}

/**
 * Built-in events for the local demo mode (CMS_FACULTY_MODE unset). Intentionally empty: all Sophia Forum events
 * is managed in the CMS (Admin → Events), and a production build is always a CMS backend build
 * (src/lib/build-env.ts). The former sample data of another site was removed in the Sophia Forum cleanup.
 */
export const STATIC_EVENTS: EventItem[] = [];
