import { json, requireAdmin } from "@/lib/cms/auth";
import { createFaculty, listFaculty } from "@/lib/cms/faculty";
import { readJsonBody, validateFacultyInput } from "@/lib/cms/validation";
import { facultyPhotoPath, syncFacultyMedia } from "@/lib/cms/faculty-media";

// Sophia CMS API (dark): only active when CMS_FACULTY_MODE=backend; every handler requires an admin session.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;
  const result = await listFaculty(ctx.client);
  return json(result.body, result.status);
}

export async function POST(request: Request) {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;
  const body = await readJsonBody(request);
  if (!body.ok) return json({ error: body.error }, body.status);
  const input = validateFacultyInput(body.body, "create", facultyPhotoPath);
  if (!input.ok) return json({ error: "Please correct the highlighted fields.", errors: input.errors }, 400);
  const result = await createFaculty(ctx.client, input.value);
  if (result.status === 201) await syncFacultyMedia(ctx.client, String(input.value.id), (result.body as { data: { image: string } }).data);
  return json(result.body, result.status);
}
