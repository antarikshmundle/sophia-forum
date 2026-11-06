import { vi } from "vitest";

/**
 * In-memory stand-in for the parts of the Supabase client the CMS uses (no network): one table of rows keyed by id,
 * plus one storage bucket. Supports the query chains used in src/lib/cms (insert/update/delete/select + eq/order/
 * single/maybeSingle) and storage upload/list/remove. `failNext` makes the next database call return an error.
 */
type Row = Record<string, unknown>;
type DbError = { code: string; message: string };

export const PROJECT_URL = "https://testproj.supabase.co";
export const MEDIA_BASE = `${PROJECT_URL}/storage/v1/object/public/site-media/`;
export const media = (path: string) => MEDIA_BASE + path;
export const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export function fakeSupabase(initial: { table: string; rows: Row[] }, files: string[] = []) {
  const rows = initial.rows.map((r) => ({ ...r }));
  const objects = new Set(files);
  let pendingError: DbError | null = null;
  let storageListError: string | null = null;

  // awaitable like the real query builder
  class Query {
    private op: "select" | "insert" | "update" | "delete" = "select";
    private payload: Row = {};
    private filters: [string, unknown][] = [];
    private mode: "many" | "single" | "maybe" = "many";
    constructor(private table: string) {}
    select() { return this; }
    insert(row: Row) { this.op = "insert"; this.payload = row; return this; }
    update(row: Row) { this.op = "update"; this.payload = row; return this; }
    delete() { this.op = "delete"; return this; }
    eq(column: string, value: unknown) { this.filters.push([column, value]); return this; }
    order() { return this; }
    single() { this.mode = "single"; return this; }
    maybeSingle() { this.mode = "maybe"; return this; }
    private run(): { data: unknown; error: DbError | null } {
      if (this.table !== initial.table) return { data: null, error: { code: "42P01", message: `unknown table ${this.table}` } };
      if (pendingError) { const error = pendingError; pendingError = null; return { data: null, error }; }
      const match = (r: Row) => this.filters.every(([c, v]) => r[c] === v);
      let out: Row[];
      if (this.op === "insert") {
        if (rows.some((r) => r.id === this.payload.id)) return { data: null, error: { code: "23505", message: `duplicate key value violates unique constraint "${this.table}_pkey"` } };
        const row = { ...this.payload, updated_at: "2026-11-05T00:00:00Z" };
        rows.push(row);
        out = [row];
      } else if (this.op === "update") {
        out = rows.filter(match);
        for (const r of out) Object.assign(r, this.payload, { updated_at: "2026-11-05T00:00:01Z" });
      } else if (this.op === "delete") {
        out = rows.filter(match);
        for (const r of out) rows.splice(rows.indexOf(r), 1);
      } else out = rows.filter(match);
      const copy = out.map((r) => ({ ...r }));
      if (this.mode === "single") return copy.length === 1 ? { data: copy[0], error: null } : { data: null, error: { code: "PGRST116", message: "not one row" } };
      if (this.mode === "maybe") return { data: copy[0] ?? null, error: null };
      return { data: copy, error: null };
    }
    then<A, B>(ok?: ((v: { data: unknown; error: DbError | null }) => A) | null, fail?: ((e: unknown) => B) | null) {
      return Promise.resolve(this.run()).then(ok, fail);
    }
  }

  const bucket = {
    upload: vi.fn(async (path: string) => { objects.add(path); return { data: { path }, error: null }; }),
    list: vi.fn(async (folder: string) => {
      if (storageListError) return { data: null, error: { message: storageListError } };
      const names = [...objects].filter((p) => p.startsWith(folder + "/")).map((p) => ({ name: p.slice(folder.length + 1) }));
      return { data: names, error: null };
    }),
    remove: vi.fn(async (paths: string[]) => { for (const p of paths) objects.delete(p); return { data: paths.map((name) => ({ name })), error: null }; }),
  };
  const from = vi.fn((table: string) => new Query(table));
  const client = { from, storage: { from: vi.fn(() => bucket) } };

  return {
    client,
    rows,
    objects,
    bucket,
    from,
    failNext: (error: DbError) => { pendingError = error; },
    failStorageList: (message: string) => { storageListError = message; },
  };
}
