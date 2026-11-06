import { json, requireAdmin } from "@/lib/cms/auth";
import { getMessage, updateMessage } from "@/lib/cms/faculty";
import { checkMessageTransition, isUuid, readJsonBody, validateMessageInput } from "@/lib/cms/validation";

// Sophia CMS API: update one HOD message (wording, status, approval) through the workflow
// draft → approved → published → archived (validation.ts). Admin only.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!isUuid(id)) return json({ error: "Message not found." }, 404);
  const body = await readJsonBody(request);
  if (!body.ok) return json({ error: body.error }, body.status);
  const input = validateMessageInput(body.body, "update");
  if (!input.ok) return json({ error: "Please correct the highlighted fields.", errors: input.errors }, 400);
  const current = await getMessage(ctx.client, id);
  if (!current.ok) return json(current.result.body, current.result.status);
  if (!current.data) return json({ error: "Message not found." }, 404);
  const step = checkMessageTransition(current.data, input.value);
  if (!step.ok) return json(step.errors ? { error: step.error, errors: step.errors } : { error: step.error }, step.status);
  const result = await updateMessage(ctx.client, id, step.value);
  return json(result.body, result.status);
}
