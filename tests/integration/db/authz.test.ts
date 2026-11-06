import { beforeAll, describe, expect, it } from "vitest";
import { USERS, fixtures, insertAs, insertSql, setupDatabase, type Who } from "./helpers";

const db = setupDatabase();

const TABLES = {
  team_members: fixtures.member,
  events: fixtures.event,
  gallery_items: fixtures.gallery,
  faculty: fixtures.faculty,
} as const;
type Table = keyof typeof TABLES;
// a writable text column per table
const TEXT: Record<Table, string> = { team_members: "name", events: "name", gallery_items: "title", faculty: "name" };
const NON_ADMINS: Who[] = ["noProfile", "manager"];

beforeAll(async () => {
  for (const [table, make] of Object.entries(TABLES) as [Table, (id: string, o?: Record<string, unknown>) => Record<string, unknown>][]) {
    await insertAs(db, "owner", table, make("seed-published", { is_published: true }));
    await insertAs(db, "owner", table, make("seed-draft"));
  }
});

describe.each(Object.keys(TABLES) as Table[])("%s", (table) => {
  const make = TABLES[table] as (id: string, o?: Record<string, unknown>) => Record<string, unknown>;

  it("anon: no insert, update or delete privilege", async () => {
    const { sql, params } = insertSql(table, make("anon-new"));
    await db.fails("anon", sql, params, "42501");
    await db.fails("anon", `update public.${table} set ${TEXT[table]} = 'x' where id = 'seed-published'`, undefined, "42501");
    await db.fails("anon", `delete from public.${table} where id = 'seed-published'`, undefined, "42501");
  });

  it("anon: reads published rows only, and never updated_by", async () => {
    const r = await db.as("anon", `select id from public.${table} order by id`);
    expect(r.rows.map((x) => x.id)).toEqual(["seed-published"]);
    await db.fails("anon", `select updated_by from public.${table}`, undefined, "42501");
    await db.fails("anon", `select * from public.${table}`, undefined, "42501");
  });

  it.each(NON_ADMINS)("%s: reads published rows only and cannot write", async (who) => {
    expect((await db.as(who, `select id from public.${table} order by id`)).rows.map((x) => x.id)).toEqual(["seed-published"]);
    const { sql, params } = insertSql(table, make(`${who.toLowerCase()}-new`));
    await db.fails(who, sql, params, "42501");
    const upd = await db.as(who, `update public.${table} set ${TEXT[table]} = 'hacked' where id in ('seed-published', 'seed-draft')`);
    expect(upd.rowCount).toBe(0);
    const del = await db.as(who, `delete from public.${table} where id in ('seed-published', 'seed-draft')`);
    expect(del.rowCount).toBe(0);
    expect((await db.as("owner", `select count(*)::int as n from public.${table} where id like 'seed-%'`)).rows[0].n).toBe(2);
  });

  it("admin: reads every row", async () => {
    expect((await db.as("admin", `select id from public.${table} order by id`)).rows.map((x) => x.id)).toEqual(["seed-draft", "seed-published"]);
  });

  it("admin: the ID is insert-only", async () => {
    await db.fails("admin", `update public.${table} set id = 'renamed' where id = 'seed-draft'`, undefined, "42501");
  });

  it("nobody sets updated_by / updated_at directly", async () => {
    await db.fails("admin", `update public.${table} set updated_by = $1 where id = 'seed-draft'`, [USERS.manager], "42501");
    const { sql, params } = insertSql(table, { ...make("admin-stamp"), updated_by: USERS.manager });
    await db.fails("admin", sql, params, "42501");
  });
});

describe("faculty-specific grants", () => {
  it("anon cannot read photo consent; is_active_hod is not writable even by an admin", async () => {
    await db.fails("anon", "select image_consent from public.faculty", undefined, "42501");
    await db.fails("admin", "update public.faculty set is_active_hod = true where id = 'seed-published'", undefined, "42501");
    const { sql, params } = insertSql("faculty", fixtures.faculty("hod-direct", { is_active_hod: true }));
    await db.fails("admin", sql, params, "42501");
  });
});

describe("profiles: no self-service roles", () => {
  it("a user sees only their own profile", async () => {
    expect((await db.as("admin", "select user_id from public.profiles")).rows).toEqual([{ user_id: USERS.admin }]);
    expect((await db.as("noProfile", "select user_id from public.profiles")).rows).toEqual([]);
  });

  it.each(["noProfile", "manager", "admin"] as Who[])("%s cannot create or change any profile", async (who) => {
    await db.fails(who, "insert into public.profiles (user_id, display_name, role) values ($1, 'x', 'admin')", [USERS.noProfile], "42501");
    await db.fails(who, "update public.profiles set role = 'admin'", undefined, "42501");
    await db.fails(who, "delete from public.profiles", undefined, "42501");
  });

  it("app_role(): admin, manager, null without a profile; not callable when signed out", async () => {
    expect((await db.as("admin", "select public.app_role() as r")).rows[0].r).toBe("admin");
    expect((await db.as("manager", "select public.app_role() as r")).rows[0].r).toBe("manager");
    expect((await db.as("noProfile", "select public.app_role() as r")).rows[0].r).toBeNull();
    await db.fails("anon", "select public.app_role()", undefined, "42501");
  });
});

describe("audit_log", () => {
  it("only an admin reads it, and nobody writes it directly", async () => {
    expect((await db.as("admin", "select count(*)::int as n from public.audit_log")).rows[0].n).toBeGreaterThan(0);
    expect((await db.as("manager", "select count(*)::int as n from public.audit_log")).rows[0].n).toBe(0);
    await db.fails("anon", "select count(*) from public.audit_log", undefined, "42501");
    for (const who of ["admin", "manager"] as Who[]) {
      await db.fails(who, "insert into public.audit_log (table_name, record_id, action) values ('events', 'x', 'insert')", undefined, "42501");
      await db.fails(who, "delete from public.audit_log", undefined, "42501");
    }
  });

  it("internal trigger functions are not callable through the API", async () => {
    for (const fn of ["set_updated_fields", "write_audit_log", "faculty_guard_active_hod", "hod_messages_guard_publish"]) {
      const r = await db.as<{ ok: boolean }>("owner", `select has_function_privilege('authenticated', 'public.${fn}()', 'execute') as ok`);
      expect(r.rows[0].ok, fn).toBe(false);
    }
  });
});
