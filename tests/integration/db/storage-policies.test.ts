import { describe, expect, it } from "vitest";
import { setupDatabase } from "./helpers";

const db = setupDatabase();

// storage.objects rows are what Supabase Storage writes for each upload / replace / delete (as the signed-in user, so
// these policies apply). The file bytes themselves are outside the database (Tier 2 covers real uploads).
const UUID = "00000000-0000-4000-8000-0000000000aa";
const insert = "insert into storage.objects (bucket_id, name) values ($1, $2)";

describe("site-media storage policies", () => {
  it.each(["faculty", "team", "events", "gallery"])("an admin may upload to %s/<record>/<uuid>.<jpg|png|webp>", async (module) => {
    for (const ext of ["jpg", "png", "webp"]) await db.as("admin", insert, ["site-media", `${module}/rec-1/${UUID.slice(0, -1)}${ext.length}.${ext}`]);
    expect((await db.as("admin", "select count(*)::int as n from storage.objects where name like $1", [`${module}/rec-1/%`])).rows[0].n).toBe(3);
  });

  it.each([
    ["path traversal", `events/../team/${UUID}.png`],
    ["an unknown module", `profiles/rec-1/${UUID}.png`],
    ["a non-UUID file name", "events/rec-1/poster.png"],
    ["an SVG", `events/rec-1/${UUID}.svg`],
    ["a nested folder", `events/rec-1/sub/${UUID}.png`],
    ["an uppercase record folder", `events/Rec/${UUID}.png`],
    ["the bucket root", `${UUID}.png`],
  ])("an admin may not upload %s", async (_l, name) => {
    await db.fails("admin", insert, ["site-media", name], "42501");
  });

  it.each(["manager", "noProfile", "anon"] as const)("%s may not upload, list, rename or delete", async (who) => {
    await db.as("admin", insert, ["site-media", `events/protected/${UUID}.png`]);
    await db.fails(who, insert, ["site-media", `events/${who.toLowerCase()}/${UUID}.png`], "42501");
    expect((await db.as(who, "select name from storage.objects where bucket_id = 'site-media'")).rows).toEqual([]);
    expect((await db.as(who, "update storage.objects set name = name where bucket_id = 'site-media'")).rowCount).toBe(0);
    expect((await db.as(who, "delete from storage.objects where bucket_id = 'site-media'")).rowCount).toBe(0);
    expect((await db.as("owner", "select count(*)::int as n from storage.objects where name = $1", [`events/protected/${UUID}.png`])).rows[0].n).toBe(1);
    await db.as("owner", "delete from storage.objects");
  });

  it("an admin may replace (rename within the rules) and delete, but not rename outside them", async () => {
    await db.as("admin", insert, ["site-media", `events/rep/${UUID}.png`]);
    await db.fails("admin", "update storage.objects set name = 'events/rep/../../x.png' where name = $1", [`events/rep/${UUID}.png`], "42501");
    expect((await db.as("admin", "update storage.objects set name = $1 where name = $2", [`events/rep/${UUID}.webp`, `events/rep/${UUID}.png`])).rowCount).toBe(1);
    expect((await db.as("admin", "delete from storage.objects where name like 'events/rep/%'")).rowCount).toBe(1);
  });

  it("other buckets get no access from these policies", async () => {
    await db.as("owner", "insert into storage.buckets (id, name) values ('other', 'other')");
    await db.fails("admin", insert, ["other", `events/rec-1/${UUID}.png`], "42501");
  });
});
