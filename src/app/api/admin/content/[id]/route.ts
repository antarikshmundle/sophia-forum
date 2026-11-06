import { json, requireAdmin } from "@/lib/cms/auth";
import { isContentId, saveContent, validateContent } from "@/lib/cms/content";
import { CONTENT_MEDIA, pruneMedia, referencedMedia } from "@/lib/cms/media";
import { readJsonBody } from "@/lib/cms/validation";

// the section whose photo is uploaded to the reserved Content folder (media-path.ts)
const PHOTO_SECTION = "home.about";

// Sophia CMS API: save one page section (Admin → Content). Only active when CMS_FACULTY_MODE=backend; admin only.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!isContentId(id)) return json({ error: "Section not found." }, 404);
  const body = await readJsonBody(request);
  if (!body.ok) return json({ error: body.error }, body.status);
  const input = validateContent(id, body.body);
  if (!input.ok) return json({ error: "Please correct the highlighted fields.", errors: input.errors }, 400);
  const result = await saveContent(ctx.client, id, input.data);
  // only after a successful save: delete the folder's other files (replaced or abandoned uploads), never the saved one
  if (result.status === 200 && id === PHOTO_SECTION) {
    const saved = (result.body as { data: Record<string, unknown> }).data;
    await pruneMedia(ctx.client, CONTENT_MEDIA.module, CONTENT_MEDIA.recordId, referencedMedia([saved?.photo]));
  }
  return json(result.body, result.status);
}
