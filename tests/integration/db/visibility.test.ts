import { describe, expect, it } from "vitest";
import { fixtures, insertAs, setupDatabase } from "./helpers";

const db = setupDatabase();

// What the public site reads (lib/cms/public.ts uses the public key with no session = the anon role)
describe.each([
  ["team_members", fixtures.member, "id, name, role, category, photo, sort_order"],
  ["events", fixtures.event, "id, name, event_date, venue, status, poster"],
  ["gallery_items", fixtures.gallery, "id, title, category, event, year, url"],
  ["faculty", fixtures.faculty, "id, name, designation, department, image_path, sort_order"],
] as const)("%s publish / unpublish", (table, make, columns) => {
  it("a draft is invisible to the public until an admin publishes it, and disappears when unpublished", async () => {
    const id = `vis-${table.replace("_", "-")}`;
    await insertAs(db, "admin", table, make(id) as Record<string, unknown>);
    const publicRead = async () => (await db.as("anon", `select ${columns} from public.${table} where id = $1`, [id])).rows;

    expect(await publicRead()).toEqual([]);
    await db.as("admin", `update public.${table} set is_published = true where id = $1`, [id]);
    expect(await publicRead()).toHaveLength(1);
    await db.as("admin", `update public.${table} set is_published = false where id = $1`, [id]);
    expect(await publicRead()).toEqual([]);
    // the admin still sees it
    expect((await db.as("admin", `select id from public.${table} where id = $1`, [id])).rows).toHaveLength(1);
  });
});

describe("drafts never leak through filters or counts", () => {
  it("anon counts and lookups by ID only ever see published rows", async () => {
    await insertAs(db, "admin", "events", fixtures.event("leak-draft"));
    await insertAs(db, "admin", "events", fixtures.event("leak-live", { is_published: true }));
    expect((await db.as("anon", "select count(*)::int as n from public.events where id like 'leak-%'")).rows[0].n).toBe(1);
    expect((await db.as("anon", "select id from public.events where id = 'leak-draft'")).rows).toEqual([]);
    expect((await db.as("anon", "select id from public.events where is_published = false")).rows).toEqual([]);
  });
});

describe("HOD message visibility", () => {
  it("only a published message is public, and only its public columns", async () => {
    await insertAs(db, "admin", "faculty", fixtures.faculty("vis-hod", { is_published: true }));
    await db.as("admin", "select public.set_active_hod('vis-hod')");
    const msg = (await db.as("admin", "insert into public.hod_messages (faculty_id, message) values ('vis-hod', 'Draft words') returning id")).rows[0].id;
    expect((await db.as("anon", "select id from public.hod_messages")).rows).toEqual([]);

    await db.as("admin", "update public.hod_messages set status = 'published', approved_by = 'HOD', approved_on = '2026-11-01' where id = $1", [msg]);
    expect((await db.as("anon", "select id, faculty_id, message, status from public.hod_messages")).rows).toEqual([{ id: msg, faculty_id: "vis-hod", message: "Draft words", status: "published" }]);
    await db.fails("anon", "select approved_by from public.hod_messages", undefined, "42501");

    await db.as("admin", "update public.hod_messages set status = 'archived' where id = $1", [msg]);
    expect((await db.as("anon", "select id from public.hod_messages")).rows).toEqual([]);
  });
});
