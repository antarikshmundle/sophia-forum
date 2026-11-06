import { STATIC_EVENTS, type EventItem } from "@/data/staticEvents";
import { STATIC_TEAM, type TeamMember } from "@/data/staticTeam";
import { GALLERY_PHOTOS, STATIC_VIDEOS, type GalleryMediaItem } from "@/data/staticGallery";

export { getInitials, getYouTubeId } from "./format";

/**
 * The offline datasets carry bare placeholder links (e.g. "https://linkedin.com",
 * "https://forms.google.com") where the real URL was not recovered. A link only
 * counts as real when it points somewhere below the site root.
 */
export function isRealLink(url?: string): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/\/+$/, "") !== "" || parsed.search !== "";
  } catch {
    return false;
  }
}

/** The member's own site counts as real even at the root, unless it is a known placeholder host. */
const PLACEHOLDER_HOSTS = ["linkedin.com", "github.com", "instagram.com", "forms.google.com"];
export function isRealWebsite(url?: string): url is string {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return !PLACEHOLDER_HOSTS.includes(host) || isRealLink(url);
  } catch {
    return false;
  }
}

export const isUpcoming = (event: EventItem) => event.status === "upcoming";

export function getEventById(id: string): EventItem | undefined {
  return STATIC_EVENTS.find((event) => event.id === id);
}

export function getMemberById(id: string): TeamMember | undefined {
  return STATIC_TEAM.find((member) => member.id === id);
}

/** Gallery items are tagged by event name, matching `EventItem.name`. */
export function getGalleryItemsForEvent(event: EventItem): GalleryMediaItem[] {
  return [...GALLERY_PHOTOS, ...STATIC_VIDEOS].filter((item) => item.event === event.name);
}

/** One dataset entry stores the venue in `time`; hide the time when it just repeats the venue. */
export function getEventTime(event: EventItem): string | null {
  return event.time && event.time !== event.venue ? event.time : null;
}
