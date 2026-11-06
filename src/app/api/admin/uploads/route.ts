import { json, requireAdmin } from "@/lib/cms/auth";
import { MAX_MEDIA_BYTES, MEDIA_TOO_LARGE, uploadMedia } from "@/lib/cms/media";
import { readCappedBytes } from "@/lib/cms/validation";

// Sophia CMS API: admin photo upload (multipart: module, recordId, file). Only active when CMS_FACULTY_MODE=backend;
// admin only and same-origin (requireAdmin). The stored file is referenced once the record is saved; files a record
// doesn't reference are removed when that record is saved or deleted.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// the image plus the multipart envelope (boundaries, part headers, the two text fields): 4 MB + 64 KB, still below
// Vercel's ~4.5 MB request-body limit, so the platform never cuts off a request that this route would accept
const MAX_UPLOAD_BODY = MAX_MEDIA_BYTES + 64 * 1024;
const TOO_LARGE = MEDIA_TOO_LARGE;

export async function POST(request: Request) {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;
  const type = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data/i.test(type)) return json({ error: "Send the file as multipart/form-data." }, 415);
  // refused before reading when the declared size is too large; otherwise the stream is read with a hard cap, so a
  // body without (or with a false) Content-Length is never buffered beyond the limit
  if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BODY) return json({ error: TOO_LARGE }, 413);
  const body = await readCappedBytes(request, MAX_UPLOAD_BODY);
  if (!body.ok) return json({ error: TOO_LARGE }, 413);
  let form: FormData;
  try {
    form = await new Response(body.bytes, { headers: { "content-type": type } }).formData();
  } catch {
    return json({ error: "Invalid upload." }, 400);
  }
  const result = await uploadMedia(ctx.client, String(form.get("module") ?? ""), String(form.get("recordId") ?? ""), form.get("file"));
  return json(result.body, result.status);
}
