import { json, requireAdmin } from "@/lib/cms/auth";
import { listContent } from "@/lib/cms/content";

// Sophia CMS API: the stored page-section text (Admin → Content). Only active when CMS_FACULTY_MODE=backend; admin only.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;
  const result = await listContent(ctx.client);
  return json(result.body, result.status);
}
