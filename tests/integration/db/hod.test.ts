import { beforeEach, describe, expect, it } from "vitest";
import { fixtures, insertAs, setupDatabase } from "./helpers";

const db = setupDatabase();

const activeHods = async () => (await db.as("owner", "select id from public.faculty where is_active_hod order by id")).rows.map((r) => r.id);
const approved = { approved_by: "Dr. HOD (email)", approved_on: "2026-11-01" };

beforeEach(async () => {
  // each test starts with no HOD, no messages and three faculty records
  await db.as("owner", "update public.faculty set is_active_hod = false where is_active_hod");
  await db.as("owner", "delete from public.hod_messages");
  await db.as("owner", "delete from public.faculty");
  for (const [id, published] of [["hod-a", true], ["hod-b", true], ["hod-draft", false]] as const) {
    await insertAs(db, "owner", "faculty", fixtures.faculty(id, { is_published: published }));
  }
});

describe("set_active_hod / clear_active_hod", () => {
  it("only an admin can change the HOD", async () => {
    for (const who of ["manager", "noProfile"] as const) {
      const e = await db.fails(who, "select public.set_active_hod('hod-a')", undefined, "42501");
      expect(e.hint).toBe("sophia:not_admin");
      await db.fails(who, "select public.clear_active_hod()", undefined, "42501");
    }
    await db.fails("anon", "select public.set_active_hod('hod-a')", undefined, "42501");
    expect(await activeHods()).toEqual([]);
  });

  it("refuses an unknown or unpublished record", async () => {
    expect((await db.fails("admin", "select public.set_active_hod('nobody')", undefined, "P0002")).hint).toBe("sophia:not_found");
    expect((await db.fails("admin", "select public.set_active_hod('hod-draft')", undefined, "P0001")).hint).toBe("sophia:hod_unpublished");
  });

  it("switching HOD moves the flag and archives the previous HOD's published message", async () => {
    await db.as("admin", "select public.set_active_hod('hod-a')");
    const msg = (await db.as("admin", "insert into public.hod_messages (faculty_id, message, status, approved_by, approved_on) values ('hod-a', 'Welcome.', 'published', $1, $2) returning id", [approved.approved_by, approved.approved_on])).rows[0].id;
    await db.as("admin", "select public.set_active_hod('hod-b')");
    expect(await activeHods()).toEqual(["hod-b"]);
    expect((await db.as("owner", "select status from public.hod_messages where id = $1", [msg])).rows[0].status).toBe("archived");
    // setting the same HOD again changes nothing
    await db.as("admin", "select public.set_active_hod('hod-b')");
    expect(await activeHods()).toEqual(["hod-b"]);
  });

  it("clearing the HOD removes the flag and archives the published message", async () => {
    await db.as("admin", "select public.set_active_hod('hod-a')");
    await db.as("admin", "insert into public.hod_messages (faculty_id, message, status, approved_by, approved_on) values ('hod-a', 'Hi.', 'published', $1, $2)", [approved.approved_by, approved.approved_on]);
    await db.as("admin", "select public.clear_active_hod()");
    expect(await activeHods()).toEqual([]);
    expect((await db.as("owner", "select status from public.hod_messages")).rows).toEqual([{ status: "archived" }]);
  });

  it("concurrent switches all succeed and leave exactly one HOD", async () => {
    const calls = Array.from({ length: 24 }, (_, i) => db.as("admin", "select public.set_active_hod($1)", [i % 2 ? "hod-a" : "hod-b"]));
    const results = await Promise.allSettled(calls);
    expect(results.filter((r) => r.status === "rejected")).toEqual([]);
    expect(await activeHods()).toHaveLength(1);
  });

  it("even the owner can't create a second active HOD (unique index)", async () => {
    await db.as("admin", "select public.set_active_hod('hod-a')");
    const e = await db.fails("owner", "update public.faculty set is_active_hod = true where id = 'hod-b'", undefined, "23505");
    expect(e.constraint).toBe("faculty_one_active_hod");
  });
});

describe("protected faculty records", () => {
  it("the active HOD can't be deleted or unpublished", async () => {
    await db.as("admin", "select public.set_active_hod('hod-a')");
    expect((await db.fails("admin", "delete from public.faculty where id = 'hod-a'", undefined, "P0001")).hint).toBe("sophia:active_hod_delete");
    expect((await db.fails("admin", "update public.faculty set is_published = false where id = 'hod-a'", undefined, "P0001")).hint).toBe("sophia:active_hod_unpublish");
    expect(await activeHods()).toEqual(["hod-a"]);
  });

  it("a faculty record with message history can't be deleted (restrict)", async () => {
    await db.as("admin", "insert into public.hod_messages (faculty_id, message) values ('hod-b', 'A draft.')");
    // PostgreSQL 18 reports ON DELETE RESTRICT as 23001 restrict_violation; 17 and earlier (staging today) as 23503
    const version = Number((await db.as("owner", "show server_version_num")).rows[0].server_version_num);
    const e = await db.fails("admin", "delete from public.faculty where id = 'hod-b'", undefined, version >= 180000 ? "23001" : "23503");
    expect(e.constraint).toBe("hod_messages_faculty_id_fkey");
    expect((await db.as("owner", "select count(*)::int as n from public.faculty where id = 'hod-b'")).rows[0].n).toBe(1);
  });

  it("a record without history can be deleted", async () => {
    expect((await db.as("admin", "delete from public.faculty where id = 'hod-draft'")).rowCount).toBe(1);
  });
});

describe("HOD message workflow", () => {
  beforeEach(async () => { await db.as("admin", "select public.set_active_hod('hod-a')"); });

  it("publishing needs an approver and an approval date", async () => {
    const e = await db.fails("admin", "insert into public.hod_messages (faculty_id, message, status) values ('hod-a', 'x', 'published')", undefined, "23514");
    expect(e.constraint).toBe("hod_messages_approval_required");
    await db.fails("admin", "insert into public.hod_messages (faculty_id, message, status, approved_by) values ('hod-a', 'x', 'approved', 'Someone')", undefined, "23514");
  });

  it("only the current, published HOD's message can be published", async () => {
    const e = await db.fails("admin", "insert into public.hod_messages (faculty_id, message, status, approved_by, approved_on) values ('hod-b', 'x', 'published', $1, $2)", [approved.approved_by, approved.approved_on], "P0001");
    expect(e.hint).toBe("sophia:publish_not_active_hod");
  });

  it("at most one message is published at a time", async () => {
    const insert = "insert into public.hod_messages (faculty_id, message, status, approved_by, approved_on) values ('hod-a', $1, 'published', $2, $3)";
    await db.as("admin", insert, ["First", approved.approved_by, approved.approved_on]);
    const e = await db.fails("admin", insert, ["Second", approved.approved_by, approved.approved_on], "23505");
    expect(e.constraint).toBe("hod_messages_one_published");
  });

  it("messages are never deleted, their faculty can't change, and every change is audited", async () => {
    const id = (await db.as("admin", "insert into public.hod_messages (faculty_id, message) values ('hod-a', 'v1') returning id")).rows[0].id;
    await db.as("admin", "update public.hod_messages set message = 'v2' where id = $1", [id]);
    await db.fails("admin", "delete from public.hod_messages where id = $1", [id], "42501");
    await db.fails("admin", "update public.hod_messages set faculty_id = 'hod-b' where id = $1", [id], "42501");
    const audit = await db.as("admin", "select action, after->>'message' as message from public.audit_log where table_name = 'hod_messages' and record_id = $1 order by id", [id]);
    expect(audit.rows).toEqual([{ action: "insert", message: "v1" }, { action: "update", message: "v2" }]);
  });

  it("non-admins can't write messages", async () => {
    await db.fails("manager", "insert into public.hod_messages (faculty_id, message) values ('hod-a', 'x')", undefined, "42501");
    await db.fails("anon", "insert into public.hod_messages (faculty_id, message) values ('hod-a', 'x')", undefined, "42501");
  });
});
