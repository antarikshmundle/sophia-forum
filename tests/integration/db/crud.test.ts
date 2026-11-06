import { describe, expect, it } from "vitest";
import { USERS, fixtures, insertAs, insertSql, setupDatabase } from "./helpers";

const db = setupDatabase();

describe("admin create / update / delete persistence", () => {
  it.each([
    ["team_members", fixtures.member("crud-member", { skills: ["Python", "SQL"], linkedin: "https://linkedin.com/in/x" })],
    ["events", fixtures.event("crud-event", { event_time: "10:00 AM", registration_link: "https://forms.example/x" })],
    ["gallery_items", fixtures.gallery("crud-photo", { thumbnail_url: "/images/t.jpg" })],
    ["faculty", fixtures.faculty("crud-faculty", { linkedin: "https://linkedin.com/in/y", quote: "Learn by building." })],
  ] as const)("%s: a row survives create → read → update → delete, with defaults, stamps and audit", async (table, row) => {
    const created = await insertAs(db, "admin", table, row as Record<string, unknown>);
    expect(created).toMatchObject(row);
    expect(created.is_published).toBe(false);
    expect(created.created_at).toBeInstanceOf(Date);

    const textColumn = table === "gallery_items" ? "title" : "name";
    const updated = (await db.as("admin", `update public.${table} set ${textColumn} = 'Renamed', is_published = true where id = $1 returning *`, [row.id])).rows[0];
    expect(updated[textColumn]).toBe("Renamed");
    expect(updated.updated_by).toBe(USERS.admin);
    expect((updated.updated_at as Date).getTime()).toBeGreaterThanOrEqual((created.updated_at as Date).getTime());

    // a separate connection sees the committed change
    expect((await db.as("owner", `select ${textColumn} as t from public.${table} where id = $1`, [row.id])).rows[0].t).toBe("Renamed");

    const deleted = await db.as("admin", `delete from public.${table} where id = $1`, [row.id]);
    expect(deleted.rowCount).toBe(1);
    expect((await db.as("owner", `select count(*)::int as n from public.${table} where id = $1`, [row.id])).rows[0].n).toBe(0);

    const audit = await db.as("admin", "select action, actor from public.audit_log where table_name = $1 and record_id = $2 order by id", [table, row.id]);
    expect(audit.rows).toEqual([
      { action: "insert", actor: USERS.admin },
      { action: "update", actor: USERS.admin },
      { action: "delete", actor: USERS.admin },
    ]);
  });

  it("a duplicate ID is refused (primary key)", async () => {
    await insertAs(db, "admin", "events", fixtures.event("dup-event"));
    const { sql, params } = insertSql("events", fixtures.event("dup-event", { name: "Other" }));
    const e = await db.fails("admin", sql, params, "23505");
    expect(e.constraint).toBe("events_pkey");
  });
});

describe("database constraints (the API's last line of defence)", () => {
  const rejects = (table: string, row: Record<string, unknown>, constraint: string, code = "23514") => async () => {
    const { sql, params } = insertSql(table, row);
    const e = await db.fails("admin", sql, params, code);
    expect(e.constraint).toBe(constraint);
  };

  it.each(["Bad Slug", "a--b", "-a", "a_b", "UPPER"])("slug %j is refused", (id) => rejects("events", fixtures.event(id), "events_id_check")());

  it("blank required text is refused", rejects("events", fixtures.event("blank-venue", { venue: "   " }), "events_venue_check"));
  it("an unknown event status is refused", rejects("events", fixtures.event("bad-status", { status: "cancelled" }), "events_status_check"));
  it("only upcoming events can be featured", rejects("events", fixtures.event("feat-past", { is_featured: true, status: "completed" }), "events_featured_upcoming"));
  it.each(["javascript:alert(1)", "ftp://x.example/p.png", "images/no-slash.png", "/has space.png"])("poster %j is refused", (poster) =>
    rejects("events", fixtures.event(`p-${Math.abs(poster.length)}`, { poster }), "events_poster_check")());

  it("Team: unknown categories are refused; the 2026-27 committee categories are accepted", async () => {
    await rejects("team_members", fixtures.member("bad-cat", { category: "Admins" }), "team_members_category_check")();
    for (const [i, category] of ["Finance & Treasury", "Discipline Committee", "Women Cell", "NSS", "Sponsorship", "President"].entries()) {
      await insertAs(db, "admin", "team_members", fixtures.member(`committee-${i}`, { category }));
    }
  });

  it("Team: negative sort order and javascript: links are refused", async () => {
    await rejects("team_members", fixtures.member("neg-sort", { sort_order: -1 }), "team_members_sort_order_check")();
    await rejects("team_members", fixtures.member("js-link", { website: "javascript:alert(1)" }), "team_members_website_check")();
  });

  it("Gallery: year range and category", async () => {
    await rejects("gallery_items", fixtures.gallery("old", { year: 1999 }), "gallery_items_year_check")();
    await rejects("gallery_items", fixtures.gallery("audio", { category: "audio" }), "gallery_items_category_check")();
  });

  it("Faculty: LinkedIn must be https; photo path must be in the record's own folder and needs consent", async () => {
    await rejects("faculty", fixtures.faculty("http-li", { linkedin: "http://linkedin.com/in/x" }), "faculty_linkedin_check")();
    const own = "faculty/fac-photo/00000000-0000-4000-8000-000000000001.png";
    await rejects("faculty", fixtures.faculty("fac-photo", { image_path: own }), "faculty_image_needs_consent")();
    await rejects("faculty", fixtures.faculty("fac-photo", { image_path: "faculty/someone-else/00000000-0000-4000-8000-000000000001.png", image_consent: "Email" }), "faculty_image_path_format")();
    await rejects("faculty", fixtures.faculty("fac-photo", { image_path: "faculty/fac-photo/../x.png", image_consent: "Email" }), "faculty_image_path_format")();
    const ok = await insertAs(db, "admin", "faculty", fixtures.faculty("fac-photo", { image_path: own, image_consent: "Email from the faculty member" }));
    expect(ok.image_path).toBe(own);
    // removing consent while a photo is set is refused too
    await db.fails("admin", "update public.faculty set image_consent = null where id = 'fac-photo'", undefined, "23514");
  });

  it("a failed statement leaves nothing behind", async () => {
    await db.fails("admin", insertSql("events", fixtures.event("atomic", { status: "nope" })).sql, insertSql("events", fixtures.event("atomic", { status: "nope" })).params, "23514");
    expect((await db.as("owner", "select count(*)::int as n from public.events where id = 'atomic'")).rows[0].n).toBe(0);
    expect((await db.as("owner", "select count(*)::int as n from public.audit_log where record_id = 'atomic'")).rows[0].n).toBe(0);
  });
});

describe("Site Content", () => {
  it("an admin creates and updates a section; the change persists and is audited", async () => {
    await db.as("admin", "insert into public.site_content (id, data) values ('home.hero', $1)", [{ title: "Sophia Forum" }]);
    const r = await db.as("admin", "update public.site_content set data = $1 where id = 'home.hero' returning data, updated_by", [{ title: "Sophia Forum", subtitle: "AI & DS" }]);
    expect(r.rows[0]).toEqual({ data: { title: "Sophia Forum", subtitle: "AI & DS" }, updated_by: USERS.admin });
    expect((await db.as<{ data: { subtitle: string } }>("anon", "select data from public.site_content where id = 'home.hero'")).rows[0].data.subtitle).toBe("AI & DS");
    expect((await db.as("admin", "select count(*)::int as n from public.audit_log where table_name = 'site_content' and record_id = 'home.hero'")).rows[0].n).toBe(2);
  });

  it("sections are never deleted through the API, and the ID can't change", async () => {
    await db.as("admin", "insert into public.site_content (id, data) values ('about.stats', '{}')");
    await db.fails("admin", "delete from public.site_content where id = 'about.stats'", undefined, "42501");
    await db.fails("admin", "update public.site_content set id = 'about.other' where id = 'about.stats'", undefined, "42501");
  });

  it("refuses bad section IDs, non-object data and data over 64 KB", async () => {
    for (const id of ["Home.hero", "home", "home.hero.x", "home.hero1"]) await db.fails("admin", "insert into public.site_content (id, data) values ($1, '{}')", [id], "23514");
    await db.fails("admin", "insert into public.site_content (id, data) values ('home.cta', '[1,2]')", undefined, "23514");
    await db.fails("admin", "insert into public.site_content (id, data) values ('home.cta', $1)", [{ text: "x".repeat(70_000) }], "23514");
  });

  it("non-admins cannot write content", async () => {
    await db.fails("manager", "insert into public.site_content (id, data) values ('home.marquee', '{}')", undefined, "42501");
    await db.fails("anon", "insert into public.site_content (id, data) values ('home.marquee', '{}')", undefined, "42501");
    const upd = await db.as("manager", "update public.site_content set data = '{\"title\":\"x\"}' where id = 'home.hero'");
    expect(upd.rowCount).toBe(0);
    await db.fails("anon", "select updated_by from public.site_content", undefined, "42501");
  });
});
