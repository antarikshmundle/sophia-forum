import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, inject, it } from "vitest";
import { setupDatabase } from "./helpers";

const ROOT = resolve(__dirname, "../../..");
const db = setupDatabase();

describe("migrations", () => {
  it("every repository migration was applied, in file order", () => {
    const files = readdirSync(join(ROOT, "supabase", "migrations")).filter((f) => f.endsWith(".sql")).sort();
    expect(inject("pg").migrations).toEqual(files);
    expect(files).toHaveLength(10);
  });

  it("creates the CMS tables with row level security enabled", async () => {
    const r = await db.as("owner", `select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' order by 1`);
    expect(r.rows).toEqual(["audit_log", "events", "faculty", "gallery_items", "hod_messages", "profiles", "site_content", "team_members"].map((relname) => ({ relname, relrowsecurity: true })));
  });

  it("has the expected policies per table", async () => {
    const r = await db.as<{ tablename: string; n: string }>("owner", `select tablename, count(*)::text as n from pg_policies where schemaname in ('public', 'storage') group by 1 order by 1`);
    expect(Object.fromEntries(r.rows.map((x) => [x.tablename, Number(x.n)]))).toEqual({
      audit_log: 1, events: 5, faculty: 5, gallery_items: 5, hod_messages: 4, objects: 4, profiles: 1, site_content: 3, team_members: 5,
    });
  });

  it("security-definer functions pin search_path", async () => {
    const r = await db.as<{ proname: string; config: string[] | null }>("owner", `select p.proname, p.proconfig as config from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef order by 1`);
    expect(r.rows.map((x) => x.proname)).toEqual(["app_role", "clear_active_hod", "hod_messages_guard_publish", "set_active_hod", "write_audit_log"]);
    for (const row of r.rows) expect(row.config, row.proname).toContain("search_path=\"\"");
  });

  it("the site-media bucket is public, 4 MB (migration 20261105000001), JPEG/PNG/WebP only", async () => {
    const r = await db.as("owner", "select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'site-media'");
    expect(r.rows).toEqual([{ public: true, file_size_limit: "4194304", allowed_mime_types: ["image/jpeg", "image/png", "image/webp"] }]);
  });

  it("rolls back completely in reverse order and re-applies cleanly", async () => {
    const rollback = readdirSync(join(ROOT, "supabase", "rollback")).filter((f) => f.endsWith(".down.sql")).sort().reverse();
    const forward = readdirSync(join(ROOT, "supabase", "migrations")).filter((f) => f.endsWith(".sql")).sort();
    expect(rollback.map((f) => f.replace(".down.sql", ".sql")).reverse()).toEqual(forward);

    await db.as("owner", "delete from public.profiles; delete from auth.users");
    for (const f of rollback) await db.as("owner", readFileSync(join(ROOT, "supabase", "rollback", f), "utf8"));
    const left = await db.as("owner", `select count(*)::int as n from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'`);
    expect(left.rows[0].n).toBe(0);
    expect((await db.as("owner", "select count(*)::int as n from pg_policies where schemaname = 'storage'")).rows[0].n).toBe(0);

    // the storage rollback intentionally keeps the bucket (removed by the owner through Storage); do that step here
    await db.as("owner", "delete from storage.buckets where id = 'site-media'");
    for (const f of forward) await db.as("owner", readFileSync(join(ROOT, "supabase", "migrations", f), "utf8"));
    expect((await db.as("owner", "select count(*)::int as n from pg_policies where schemaname in ('public', 'storage')")).rows[0].n).toBe(33);
  });

  it("the 4 MB limit migration can be re-applied and leaves everything else of the bucket unchanged", async () => {
    const sql = readFileSync(join(ROOT, "supabase", "migrations", "20261105000001_site_media_4mb_limit.sql"), "utf8");
    await db.as("owner", sql);
    const r = await db.as("owner", "select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id");
    expect(r.rows).toEqual([{ id: "site-media", public: true, file_size_limit: "4194304", allowed_mime_types: ["image/jpeg", "image/png", "image/webp"] }]);
  });

  it("the 4 MB limit migration refuses (instead of silently doing nothing) when the bucket is missing", async () => {
    const sql = readFileSync(join(ROOT, "supabase", "migrations", "20261105000001_site_media_4mb_limit.sql"), "utf8");
    let message = "";
    await db.tx("owner", async (q) => {
      await q("delete from storage.buckets where id = 'site-media'");
      try { await q(sql); } catch (e) { message = (e as Error).message; throw e; }
    }).catch(() => {});
    expect(message).toMatch(/site-media bucket not found/);
    expect((await db.as("owner", "select file_size_limit from storage.buckets where id = 'site-media'")).rows).toEqual([{ file_size_limit: "4194304" }]);
  });

  it("its rollback restores 5 MB", async () => {
    await db.tx("owner", async (q) => {
      await q(readFileSync(join(ROOT, "supabase", "rollback", "20261105000001_site_media_4mb_limit.down.sql"), "utf8"));
      expect((await q("select file_size_limit from storage.buckets where id = 'site-media'")).rows).toEqual([{ file_size_limit: "5242880" }]);
      throw new Error("roll back this check");
    }).catch(() => {});
    expect((await db.as("owner", "select file_size_limit from storage.buckets where id = 'site-media'")).rows).toEqual([{ file_size_limit: "4194304" }]);
  });

  it("re-applying the storage migration without removing the bucket fails loudly (documented manual step)", async () => {
    const sql = readFileSync(join(ROOT, "supabase", "migrations", "20261102000002_storage_site_media.sql"), "utf8");
    await db.fails("owner", sql, undefined, "23505");
  });
});
