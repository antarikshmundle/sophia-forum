// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/cms/auth", async (original) => ({ ...(await original<typeof import("@/lib/cms/auth")>()), requireAdmin: auth.requireAdmin }));

import { listRoutes, recordRoutes } from "@/lib/cms/collection-routes";
import { PROJECT_URL, fakeSupabase, media, uuid } from "./fake-supabase";

const BASE = "http://localhost:3000/api/admin";
const json = (method: string, path: string, body?: unknown) =>
  new Request(BASE + path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

const OLD = `events/spring-fest/${uuid(1)}.png`;
const NEW = `events/spring-fest/${uuid(2)}.png`;
const storedEvent = {
  id: "spring-fest", name: "Spring Fest", event_date: "2026-03-01", event_time: null, venue: "Hall", status: "completed",
  description: "An event.", poster: media(OLD), registration_link: null, is_featured: false, is_published: false, updated_at: "2026-11-01T00:00:00Z",
};
const newEvent = { id: "summer-fest", name: "Summer Fest", date: "2026-06-01", venue: "Hall", status: "upcoming", description: "Another.", poster: "/images/p.png" };

let db: ReturnType<typeof fakeSupabase>;
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", PROJECT_URL);
  db = fakeSupabase({ table: "events", rows: [storedEvent] }, [OLD, NEW]);
  auth.requireAdmin.mockResolvedValue({ client: db.client, user: { id: "admin" } });
});

const events = { ...listRoutes("events"), ...recordRoutes("events") };

describe("admin collection routes — guard", () => {
  it("returns the guard's response untouched and never queries", async () => {
    auth.requireAdmin.mockResolvedValue(new Response(JSON.stringify({ error: "Sign in required." }), { status: 401 }));
    expect((await events.GET(json("GET", "/events"))).status).toBe(401);
    expect((await events.POST(json("POST", "/events", newEvent))).status).toBe(401);
    expect((await events.PATCH(json("PATCH", "/events/spring-fest", { name: "x" }), params("spring-fest"))).status).toBe(401);
    expect((await events.DELETE(json("DELETE", "/events/spring-fest"), params("spring-fest"))).status).toBe(401);
    expect(db.from).not.toHaveBeenCalled();
    expect(db.rows).toHaveLength(1);
  });
});

describe("POST", () => {
  it("creates the record (unpublished unless asked) and returns it in form shape", async () => {
    const r = await events.POST(json("POST", "/events", newEvent));
    expect(r.status).toBe(201);
    const body = await r.json();
    expect(body.data).toMatchObject({ id: "summer-fest", date: "2026-06-01", isPublished: false, isFeatured: false });
    expect(db.rows.map((x) => x.id)).toEqual(["spring-fest", "summer-fest"]);
  });

  it("refuses invalid input with field errors and writes nothing", async () => {
    const r = await events.POST(json("POST", "/events", { ...newEvent, date: "2026-02-30", poster: "https://evil.example/p.png" }));
    expect(r.status).toBe(400);
    expect((await r.json()).errors).toMatchObject({ date: expect.any(String), poster: expect.any(String) });
    expect(db.from).not.toHaveBeenCalled();
  });

  it("refuses a duplicate ID (409 on the id field) and leaves the stored record and its files alone", async () => {
    const r = await events.POST(json("POST", "/events", { ...newEvent, id: "spring-fest" }));
    expect(r.status).toBe(409);
    expect((await r.json()).errors).toEqual({ id: "An entry with this ID already exists." });
    expect(db.rows[0]).toMatchObject({ name: "Spring Fest", poster: media(OLD) });
    expect(db.bucket.remove).not.toHaveBeenCalled();
  });

  it("refuses invalid JSON", async () => {
    const r = await events.POST(new Request(BASE + "/events", { method: "POST", headers: { "content-type": "application/json" }, body: "{oops" }));
    expect(r.status).toBe(400);
  });
});

describe("PATCH", () => {
  it("replacing the poster deletes the old file and keeps the new one", async () => {
    const r = await events.PATCH(json("PATCH", "/events/spring-fest", { poster: media(NEW) }), params("spring-fest"));
    expect(r.status).toBe(200);
    expect((await r.json()).data.poster).toBe(media(NEW));
    expect([...db.objects]).toEqual([NEW]);
  });

  it("a refused update deletes no file", async () => {
    const r = await events.PATCH(json("PATCH", "/events/spring-fest", { isFeatured: true }), params("spring-fest"));
    expect(r.status).toBe(400);
    expect((await r.json()).errors).toEqual({ isFeatured: "Only upcoming events can be featured." });
    expect(db.bucket.remove).not.toHaveBeenCalled();
    expect(db.objects.size).toBe(2);
  });

  it("returns 404 for an unknown or malformed ID", async () => {
    expect((await events.PATCH(json("PATCH", "/events/nope", { name: "x" }), params("nope"))).status).toBe(404);
    expect((await events.PATCH(json("PATCH", "/events/..%2Fx", { name: "x" }), params("../x"))).status).toBe(404);
  });

  it("maps database errors (permission → 403, unknown → 500) and still never prunes", async () => {
    db.failNext({ code: "42501", message: "permission denied" });
    expect((await events.PATCH(json("PATCH", "/events/spring-fest", { name: "x" }), params("spring-fest"))).status).toBe(403);
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.failNext({ code: "XX000", message: "boom" });
    expect((await events.PATCH(json("PATCH", "/events/spring-fest", { name: "x" }), params("spring-fest"))).status).toBe(500);
    expect(db.bucket.remove).not.toHaveBeenCalled();
  });

  it("a storage clean-up failure doesn't fail a successful save", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.failStorageList("storage down");
    const r = await events.PATCH(json("PATCH", "/events/spring-fest", { name: "Spring Fest 2026" }), params("spring-fest"));
    expect(r.status).toBe(200);
    expect(db.rows[0].name).toBe("Spring Fest 2026");
  });
});

describe("DELETE", () => {
  it("deletes the record and empties its folder", async () => {
    const r = await events.DELETE(json("DELETE", "/events/spring-fest"), params("spring-fest"));
    expect(r.status).toBe(204);
    expect(db.rows).toHaveLength(0);
    expect(db.objects.size).toBe(0);
  });

  it("returns 404 for an unknown ID and deletes no file", async () => {
    expect((await events.DELETE(json("DELETE", "/events/nope"), params("nope"))).status).toBe(404);
    expect(db.bucket.remove).not.toHaveBeenCalled();
  });
});

describe("Gallery reserved ID (the Home About photo folder)", () => {
  it("is refused on update and delete before any database or storage call", async () => {
    const gallery = recordRoutes("gallery");
    for (const call of [
      () => gallery.PATCH(json("PATCH", "/gallery/content-home-about", { title: "x" }), params("content-home-about")),
      () => gallery.DELETE(json("DELETE", "/gallery/content-home-about"), params("content-home-about")),
    ]) {
      const r = await call();
      expect(r.status).toBe(400);
    }
    expect(db.from).not.toHaveBeenCalled();
    expect(db.client.storage.from).not.toHaveBeenCalled();
  });
});
