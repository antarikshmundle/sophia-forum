// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_MEDIA_BYTES, pruneMedia, referencedMedia, uploadMedia } from "@/lib/cms/media";
import { PROJECT_URL, fakeSupabase, media, uuid } from "./fake-supabase";

const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP = [..."RIFF"].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [..."WEBP"].map((c) => c.charCodeAt(0)));
const fileOf = (bytes: number[], name = "x.png", type = "image/png") => new File([new Uint8Array(bytes)], name, { type });
const OBJECT = /^events\/spring-fest\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", PROJECT_URL));

function storage() {
  const db = fakeSupabase({ table: "events", rows: [] });
  return { ...db, client: db.client as unknown as SupabaseClient };
}

describe("uploadMedia", () => {
  it.each([["JPEG", JPEG, "jpg"], ["PNG", PNG, "png"], ["WebP", WEBP, "webp"]])("stores a %s under the record's folder with a random name", async (_n, bytes, ext) => {
    const s = storage();
    const r = await uploadMedia(s.client, "events", "spring-fest", fileOf([...bytes, 1, 2, 3]));
    expect(r.status).toBe(201);
    const { url, path } = (r.body as { data: { url: string; path: string } }).data;
    expect(path).toMatch(OBJECT);
    expect(path.endsWith(`.${ext}`)).toBe(true);
    expect(url).toBe(media(path));
    expect(s.bucket.upload).toHaveBeenCalledWith(path, expect.any(Uint8Array), expect.objectContaining({ upsert: false }));
  });

  it("reads the type from the bytes, not the name or the declared type", async () => {
    const s = storage();
    const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>");
    const r = await uploadMedia(s.client, "events", "spring-fest", new File([svg], "poster.png", { type: "image/png" }));
    expect(r).toEqual({ status: 400, body: { error: "Upload a JPEG, PNG or WebP image." } });
    const jpegNamedPng = await uploadMedia(s.client, "events", "spring-fest", fileOf(JPEG, "a.png", "image/png"));
    expect((jpegNamedPng.body as { data: { path: string } }).data.path).toMatch(/\.jpg$/);
    expect(s.bucket.upload).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["an unknown module", "profiles", "spring-fest", 400],
    ["a path in the module", "../events", "spring-fest", 400],
    ["a traversal in the record ID", "events", "../team/x", 400],
    ["an encoded traversal", "events", "%2e%2e%2fteam", 400],
    ["an uppercase ID", "events", "Spring", 400],
    ["an over-long ID", "events", "a".repeat(101), 400],
  ])("refuses %s before touching storage", async (_l, module, id, status) => {
    const s = storage();
    const r = await uploadMedia(s.client, module, id, fileOf(PNG));
    expect(r.status).toBe(status);
    expect(s.bucket.upload).not.toHaveBeenCalled();
  });

  it("refuses empty, missing and oversized files", async () => {
    const s = storage();
    expect((await uploadMedia(s.client, "events", "spring-fest", fileOf([]))).status).toBe(400);
    expect((await uploadMedia(s.client, "events", "spring-fest", "not a file")).status).toBe(400);
    const big = new File([new Uint8Array(MAX_MEDIA_BYTES + 1)], "big.png");
    expect(await uploadMedia(s.client, "events", "spring-fest", big)).toEqual({ status: 413, body: { error: "The image is larger than 4 MB." } });
    expect(s.bucket.upload).not.toHaveBeenCalled();
  });

  it("the limit is 4 MB: a file of exactly 4 MB is stored, one byte more is refused", async () => {
    expect(MAX_MEDIA_BYTES).toBe(4 * 1024 * 1024);
    const s = storage();
    const exact = new Uint8Array(MAX_MEDIA_BYTES); exact.set(PNG);
    expect((await uploadMedia(s.client, "events", "spring-fest", new File([exact], "x.png"))).status).toBe(201);
    const over = new Uint8Array(MAX_MEDIA_BYTES + 1); over.set(PNG);
    expect((await uploadMedia(s.client, "events", "spring-fest", new File([over], "x.png"))).status).toBe(413);
    expect(s.bucket.upload).toHaveBeenCalledTimes(1);
  });

  it("maps Storage's own size refusal to the same 413 message", async () => {
    const s = storage();
    s.bucket.upload.mockResolvedValueOnce({ data: null, error: { message: "The object exceeded the maximum allowed size" } } as never);
    expect(await uploadMedia(s.client, "events", "spring-fest", fileOf(PNG))).toEqual({ status: 413, body: { error: "The image is larger than 4 MB." } });
  });

  it("maps a storage policy refusal to 403 and other failures to 500", async () => {
    const s = storage();
    s.bucket.upload.mockResolvedValueOnce({ data: null, error: { message: "new row violates row-level security policy" } } as never);
    expect((await uploadMedia(s.client, "events", "spring-fest", fileOf(PNG))).status).toBe(403);
    vi.spyOn(console, "error").mockImplementation(() => {});
    s.bucket.upload.mockResolvedValueOnce({ data: null, error: { message: "connection reset" } } as never);
    expect(await uploadMedia(s.client, "events", "spring-fest", fileOf(PNG))).toEqual({ status: 500, body: { error: "The upload failed. Please try again." } });
  });
});

describe("pruneMedia", () => {
  const keep = `events/spring-fest/${uuid(1)}.png`;
  const stale = `events/spring-fest/${uuid(2)}.jpg`;
  const neighbour = `events/spring-fest-2/${uuid(3)}.png`;

  it("deletes only the record's unreferenced files", async () => {
    const db = fakeSupabase({ table: "events", rows: [] }, [keep, stale, neighbour]);
    await pruneMedia(db.client as unknown as SupabaseClient, "events", "spring-fest", [keep]);
    expect(db.bucket.remove).toHaveBeenCalledWith([stale]);
    expect([...db.objects].sort()).toEqual([keep, neighbour].sort());
  });

  it("empties the folder when nothing is kept, and does nothing when nothing is stale", async () => {
    const db = fakeSupabase({ table: "events", rows: [] }, [keep, stale]);
    await pruneMedia(db.client as unknown as SupabaseClient, "events", "spring-fest", [keep, stale]);
    expect(db.bucket.remove).not.toHaveBeenCalled();
    await pruneMedia(db.client as unknown as SupabaseClient, "events", "spring-fest", []);
    expect(db.objects.size).toBe(0);
  });

  it("never deletes objects that aren't CMS uploads", async () => {
    const db = fakeSupabase({ table: "events", rows: [] }, ["events/spring-fest/readme.txt", stale]);
    await pruneMedia(db.client as unknown as SupabaseClient, "events", "spring-fest", []);
    expect(db.bucket.remove).toHaveBeenCalledWith([stale]);
  });

  it("logs and swallows storage failures; refuses a non-slug folder", async () => {
    const db = fakeSupabase({ table: "events", rows: [] }, [stale]);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    db.failStorageList("storage down");
    await expect(pruneMedia(db.client as unknown as SupabaseClient, "events", "spring-fest", [])).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
    await pruneMedia(db.client as unknown as SupabaseClient, "events", "../team", []);
    expect(db.bucket.list).toHaveBeenCalledTimes(1);
  });
});

describe("referencedMedia", () => {
  it("returns object paths for our URLs and paths, ignoring everything else", () => {
    const own = `events/spring-fest/${uuid(1)}.png`;
    expect(referencedMedia([media(own), own, "/images/a.png", "https://evil.example/x.png", null, undefined, 3, ""])).toEqual([own, own]);
  });
});
