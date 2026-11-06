/**
 * Sophia CMS rollout flags (server-only environment variables, never NEXT_PUBLIC_).
 * Both default to "demo": any missing or unrecognised value keeps today's demo behaviour.
 *
 * CMS_AUTH_MODE      demo | supabase  – which sign-in the admin area uses (fixed at build time; P2.3)
 * CMS_FACULTY_MODE   demo | backend   – "backend" enables the /api/admin CMS routes (checked per request); the Faculty
 *                                       Manager reads it at build time through facultyManagerMode() (P2.4)
 */

export type CmsAuthMode = "demo" | "supabase";
export type CmsFacultyMode = "demo" | "backend";
export type FacultyManagerMode = "demo" | "backend" | "unavailable";

export function cmsAuthMode(): CmsAuthMode {
  return process.env.CMS_AUTH_MODE === "supabase" ? "supabase" : "demo";
}

export function cmsFacultyMode(): CmsFacultyMode {
  return process.env.CMS_FACULTY_MODE === "backend" ? "backend" : "demo";
}

/**
 * The Faculty Manager's data source: the CMS backend only when the API is on AND real admin sign-in is on.
 * "unavailable" (backend API with demo sign-in) shows an error and never falls back to the demo store.
 */
export function facultyManagerMode(): FacultyManagerMode {
  if (cmsFacultyMode() !== "backend") return "demo";
  return cmsAuthMode() === "supabase" ? "backend" : "unavailable";
}
