import { json, requireAdmin } from "./auth";
import { COLLECTIONS, RESERVED_ID_ERROR, createRecord, deleteRecord, getRecord, listRecords, updateRecord, validateRecord, type Collection } from "./collections";
import { isSlug, readJsonBody } from "./validation";
import { pruneMedia, referencedMedia, type MediaModule } from "./media";

/** After a successful save: delete files in the record's folder it no longer references (replaced or abandoned). */
async function syncMedia(client: Parameters<typeof pruneMedia>[0], c: Collection, id: string, record: Record<string, unknown> | null) {
  await pruneMedia(client, c.name as MediaModule, id, record ? referencedMedia(c.mediaKeys.map((k) => record[k])) : []);
}

/** Route handlers for /api/admin/<team|events|gallery>[/<id>]; the same guards as the faculty routes. */

type Params = { params: Promise<{ id: string }> };

export function listRoutes(name: Collection["name"]) {
  const c = COLLECTIONS[name];
  return {
    async GET(request: Request) {
      const ctx = await requireAdmin(request);
      if (ctx instanceof Response) return ctx;
      const result = await listRecords(ctx.client, c);
      return json(result.body, result.status);
    },
    async POST(request: Request) {
      const ctx = await requireAdmin(request);
      if (ctx instanceof Response) return ctx;
      const body = await readJsonBody(request);
      if (!body.ok) return json({ error: body.error }, body.status);
      const input = validateRecord(c, body.body, "create");
      if (!input.ok) return json({ error: "Please correct the highlighted fields.", errors: input.errors }, 400);
      const result = await createRecord(ctx.client, c, input.row);
      if (result.status === 201) await syncMedia(ctx.client, c, String(input.row.id), (result.body as { data: Record<string, unknown> }).data);
      return json(result.body, result.status);
    },
  };
}

export function recordRoutes(name: Collection["name"]) {
  const c = COLLECTIONS[name];
  return {
    async PATCH(request: Request, { params }: Params) {
      const ctx = await requireAdmin(request);
      if (ctx instanceof Response) return ctx;
      const { id } = await params;
      if (!isSlug(id)) return json({ error: "Record not found." }, 404);
      if (c.reservedIds?.includes(id)) return json({ error: RESERVED_ID_ERROR }, 400);
      const body = await readJsonBody(request);
      if (!body.ok) return json({ error: body.error }, body.status);
      // cross-field rules (e.g. featured only while upcoming) need the stored values the request doesn't change
      const existing = await getRecord(ctx.client, c, id);
      if (!existing.ok) return json(existing.result.body, existing.result.status);
      if (!existing.record) return json({ error: "Record not found." }, 404);
      const input = validateRecord(c, body.body, "update", existing.record, id);
      if (!input.ok) return json({ error: "Please correct the highlighted fields.", errors: input.errors }, 400);
      const result = await updateRecord(ctx.client, c, id, input.row);
      if (result.status === 200) await syncMedia(ctx.client, c, id, (result.body as { data: Record<string, unknown> }).data);
      return json(result.body, result.status);
    },
    async DELETE(request: Request, { params }: Params) {
      const ctx = await requireAdmin(request);
      if (ctx instanceof Response) return ctx;
      const { id } = await params;
      if (!isSlug(id)) return json({ error: "Record not found." }, 404);
      // refused before any database or storage call: deleting would empty this reserved folder
      if (c.reservedIds?.includes(id)) return json({ error: RESERVED_ID_ERROR }, 400);
      const result = await deleteRecord(ctx.client, c, id);
      if (result.status === 204) await syncMedia(ctx.client, c, id, null);   // the record is gone: its folder is emptied
      return json(result.body, result.status);
    },
  };
}
