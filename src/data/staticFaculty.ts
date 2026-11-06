export interface FacultyMember {
  id: string;
  name: string;
  designation: string;
  department?: string;
  image: string;
  quote?: string;
  linkedin?: string;
  sortOrder: number;
}

/**
 * Built-in faculty for the local demo mode (CMS_FACULTY_MODE unset). Intentionally empty: all Sophia Forum faculty
 * is managed in the CMS (Admin → Faculty), and a production build is always a CMS backend build
 * (src/lib/build-env.ts). The former sample data of another site was removed in the Sophia Forum cleanup.
 */
export const STATIC_FACULTY: FacultyMember[] = [];
