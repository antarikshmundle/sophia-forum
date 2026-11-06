import { listRoutes } from "@/lib/cms/collection-routes";

// Sophia CMS API: gallery (migration 7b). Only active when CMS_FACULTY_MODE=backend; every handler requires an admin session.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const { GET, POST } = listRoutes("gallery");
