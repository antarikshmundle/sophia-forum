// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS, RESERVED_ID_ERROR, validateRecord } from "@/lib/cms/collections";
import { PROJECT_URL, media, uuid } from "./fake-supabase";

const events = COLLECTIONS.events;
const event = (over: Record<string, unknown> = {}) => ({
  id: "spring-fest", name: "Spring Fest", date: "2026-03-01", venue: "Seminar Hall", status: "completed",
  description: "An event.", poster: "/images/poster.png", ...over,
});

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", PROJECT_URL));

describe("validateRecord — create", () => {
  it("accepts a complete event and maps it to database columns", () => {
    const r = validateRecord(events, event({ time: "10:00 AM", isPublished: false }), "create");
    expect(r).toEqual({ ok: true, row: expect.objectContaining({ id: "spring-fest", event_date: "2026-03-01", event_time: "10:00 AM", is_published: false }) });
  });

  it("requires every required field", () => {
    const r = validateRecord(events, { id: "x" }, "create");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["date", "description", "name", "poster", "status", "venue"]);
  });

  it.each(["Bad Slug", "a--b", "-a", "UPPER", "a/b", "../x", ""])("refuses the ID %j", (id) => {
    const r = validateRecord(events, event({ id }), "create");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.id).toBeDefined();
  });

  it("refuses fields the form doesn't have, and server-set fields", () => {
    const r = validateRecord(events, event({ updatedAt: "x", updated_by: "y" }), "create");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toMatchObject({ updatedAt: "This field is set automatically.", updated_by: "This field can't be set here." });
  });

  it.each([["2026-02-30"], ["2026-13-01"], ["01-03-2026"], ["tomorrow"]])("refuses the date %s", (date) => {
    const r = validateRecord(events, event({ date }), "create");
    expect(r.ok).toBe(false);
  });

  it("enforces text limits", () => {
    const r = validateRecord(events, event({ name: "x".repeat(201) }), "create");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.name).toMatch(/200/);
  });

  it("only features upcoming events", () => {
    const r = validateRecord(events, event({ isFeatured: true, status: "completed" }), "create");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.isFeatured).toBe("Only upcoming events can be featured.");
    expect(validateRecord(events, event({ isFeatured: true, status: "upcoming" }), "create").ok).toBe(true);
  });
});

describe("validateRecord — image sources", () => {
  it.each([
    ["a site image", "/images/poster.png", true],
    ["a YouTube thumbnail", "https://img.youtube.com/vi/abcdefghijk/0.jpg", true],
    ["an upload in the record's own folder", media(`events/spring-fest/${uuid(1)}.png`), true],
    ["an upload in another record's folder", media(`events/other-event/${uuid(1)}.png`), false],
    ["an upload in another module's folder", media(`team/spring-fest/${uuid(1)}.png`), false],
    ["a third-party host", "https://evil.example/p.png", false],
    ["a protocol-relative URL", "//evil.example/p.png", false],
    ["a path with ..", "/images/../secret.png", false],
    ["a javascript: URL", "javascript:alert(1)", false],
  ])("%s → %s", (_label, poster, ok) => {
    expect(validateRecord(events, event({ poster }), "create").ok).toBe(ok);
  });
});

describe("validateRecord — update", () => {
  const stored = { ...event(), isFeatured: false, isPublished: false };

  it("never changes the ID", () => {
    const r = validateRecord(events, { id: "new-id" }, "update", stored, "spring-fest");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.id).toBe("The ID can't be changed.");
  });

  it("checks cross-field rules against the stored record", () => {
    const r = validateRecord(events, { isFeatured: true }, "update", stored, "spring-fest");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.isFeatured).toBeDefined();
  });

  it("refuses clearing a required field and an empty update", () => {
    const cleared = validateRecord(events, { venue: "" }, "update", stored, "spring-fest");
    expect(cleared.ok).toBe(false);
    const empty = validateRecord(events, {}, "update", stored, "spring-fest");
    expect(empty).toEqual({ ok: false, errors: { form: "Nothing to update." } });
  });

  it("clears an optional field to null", () => {
    expect(validateRecord(events, { time: null }, "update", stored, "spring-fest")).toEqual({ ok: true, row: { event_time: null } });
  });

  it("accepts the record's own upload on update (uses the URL id, not the body)", () => {
    const own = media(`events/spring-fest/${uuid(2)}.webp`);
    expect(validateRecord(events, { poster: own }, "update", stored, "spring-fest").ok).toBe(true);
    expect(validateRecord(events, { poster: own }, "update", stored, "another-event").ok).toBe(false);
  });
});

describe("validateRecord — gallery", () => {
  const gallery = COLLECTIONS.gallery;
  const item = (over: Record<string, unknown> = {}) => ({ id: "fest-photo", title: "Fest", category: "photo", event: "Fest", year: 2026, url: "/images/a.jpg", ...over });

  it("refuses the reserved Content folder ID", () => {
    const r = validateRecord(gallery, item({ id: "content-home-about" }), "create");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.id).toBe(RESERVED_ID_ERROR);
  });

  it("needs a YouTube URL with a video ID for videos, and an image source for photos", () => {
    expect(validateRecord(gallery, item({ category: "video", url: "https://www.youtube.com/watch?v=abcdefghijk" }), "create").ok).toBe(true);
    expect(validateRecord(gallery, item({ category: "video", url: "https://vimeo.com/123" }), "create").ok).toBe(false);
    expect(validateRecord(gallery, item({ url: "https://evil.example/a.jpg" }), "create").ok).toBe(false);
  });

  it("keeps the year in range", () => {
    expect(validateRecord(gallery, item({ year: 1999 }), "create").ok).toBe(false);
    expect(validateRecord(gallery, item({ year: 2026.5 }), "create").ok).toBe(false);
  });
});

describe("validateRecord — team", () => {
  const team = COLLECTIONS.team;
  const member = (over: Record<string, unknown> = {}) => ({ id: "a-member", name: "A Member", role: "Member", category: "Technical Team", sortOrder: 1, ...over });

  it("only accepts known categories", () => {
    expect(validateRecord(team, member(), "create").ok).toBe(true);
    expect(validateRecord(team, member({ category: "Admins" }), "create").ok).toBe(false);
  });

  it.each(["javascript:alert(1)", "ftp://x.example", "not a url", "//evil.example/x", "/\\evil.example", "///evil.example", "/path\\..\\x"])("refuses the link %j", (linkedin) => {
    expect(validateRecord(team, member({ linkedin }), "create").ok).toBe(false);
  });

  it.each(["https://linkedin.com/in/x", "http://example.com", "/team/a-member", "/"])("accepts the link %j", (website) => {
    expect(validateRecord(team, member({ website }), "create").ok).toBe(true);
  });

  it("refuses a protocol-relative registration link on events too", () => {
    expect(validateRecord(events, event({ registrationLink: "//evil.example/register" }), "create").ok).toBe(false);
    expect(validateRecord(events, event({ registrationLink: "/events/spring-fest" }), "create").ok).toBe(true);
  });

  it("limits skills", () => {
    expect(validateRecord(team, member({ skills: Array(31).fill("x") }), "create").ok).toBe(false);
    expect(validateRecord(team, member({ skills: ["  Python  "] }), "create")).toMatchObject({ ok: true, row: { skills: ["Python"] } });
  });
});
