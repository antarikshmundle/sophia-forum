import { json, requireAdmin } from "@/lib/cms/auth";
import { deleteFaculty, updateFaculty } from "@/lib/cms/faculty";
import { isSlug, readJsonBody, validateFacultyInput } from "@/lib/cms/validation";
import { facultyPhotoPath, syncFacultyMedia } from "@/lib/cms/faculty-media";

// Sophia CMS API (dark): only active when CMS_FACULTY_MODE=backend; every handler requires an admin session.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!isSlug(id)) return json({ error: "Faculty record not found." }, 404);
  const body = await readJsonBody(request);
  if (!body.ok) return json({ error: body.error }, body.status);
  const input = validateFacultyInput(body.body, "update", facultyPhotoPath, id);
  if (!input.ok) return json({ error: "Please correct the highlighted fields.", errors: input.errors }, 400);
  const result = await updateFaculty(ctx.client, id, input.value);
  if (result.status === 200) await syncFacultyMedia(ctx.client, id, (result.body as { data: { image: string } }).data);
  return json(result.body, result.status);
}

export async function DELETE(request: Request, { params }: Params) {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!isSlug(id)) return json({ error: "Faculty record not found." }, 404);
  const result = await deleteFaculty(ctx.client, id);
  if (result.status === 204) await syncFacultyMedia(ctx.client, id, null);   // the record is gone: its folder is emptied
  return json(result.body, result.status);
}
