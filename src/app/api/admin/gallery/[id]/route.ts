import { recordRoutes } from "@/lib/cms/collection-routes";

// Sophia CMS API: one gallery record (migration 7b). Only active when CMS_FACULTY_MODE=backend; admin only.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const { PATCH, DELETE } = recordRoutes("gallery");
