export interface TeamMember {
  id: string;
  name: string;
  role: string;
  category:
    | "President"
    | "Vice President"
    | "Secretary"
    | "Joint Secretary"
    | "Technical Team"
    | "Event Management Team"
    | "Social Media Team"
    | "Cultural Team"
    | "Promotional Team"
    | "Documentation Team"
    | "Girls Representative"
    | "Sports Team"
    | "Finance & Treasury"
    | "Discipline Committee"
    | "Women Cell"
    | "NSS"
    | "Sponsorship";
  /** Omitted when the member has no published photo (an initials placeholder is shown). */
  photo?: string;
  quote?: string;
  bio?: string;
  skills?: string[];
  linkedin?: string;
  github?: string;
  instagram?: string;
  twitter?: string;
  website?: string;
  sortOrder: number;
  isCreatorBadge?: boolean;
}

/**
 * Built-in team for the local demo mode (CMS_FACULTY_MODE unset). Intentionally empty: all Sophia Forum team
 * is managed in the CMS (Admin → Team), and a production build is always a CMS backend build
 * (src/lib/build-env.ts). The former sample data of another site was removed in the Sophia Forum cleanup.
 */
export const STATIC_TEAM: TeamMember[] = [];
