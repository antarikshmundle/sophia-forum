import { json, requireAdmin } from "@/lib/cms/auth";
import { clearActiveHod, setActiveHod } from "@/lib/cms/faculty";
import { readJsonBody, validateHodInput } from "@/lib/cms/validation";

// Sophia CMS API (dark): POST sets the active HOD, DELETE clears it. Admin only.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;
  const body = await readJsonBody(request);
  if (!body.ok) return json({ error: body.error }, body.status);
  const input = validateHodInput(body.body);
  if (!input.ok) return json({ error: "Please correct the highlighted fields.", errors: input.errors }, 400);
  const result = await setActiveHod(ctx.client, input.value.facultyId);
  return json(result.body, result.status);
}

export async function DELETE(request: Request) {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;
  const result = await clearActiveHod(ctx.client);
  return json(result.body, result.status);
}
