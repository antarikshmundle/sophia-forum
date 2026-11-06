import { json, requireAdmin } from "@/lib/cms/auth";
import { createMessage, listMessages } from "@/lib/cms/faculty";
import { checkNewMessage, readJsonBody, validateMessageInput } from "@/lib/cms/validation";

// Sophia CMS API (dark): HOD messages. Admin only. Messages are archived, never deleted (no DELETE handler).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;
  const result = await listMessages(ctx.client);
  return json(result.body, result.status);
}

export async function POST(request: Request) {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;
  const body = await readJsonBody(request);
  if (!body.ok) return json({ error: body.error }, body.status);
  const input = validateMessageInput(body.body, "create");
  if (!input.ok) return json({ error: "Please correct the highlighted fields.", errors: input.errors }, 400);
  const draft = checkNewMessage(input.value);
  if (!draft.ok) return json(draft.errors ? { error: draft.error, errors: draft.errors } : { error: draft.error }, draft.status);
  const result = await createMessage(ctx.client, draft.value);
  return json(result.body, result.status);
}
