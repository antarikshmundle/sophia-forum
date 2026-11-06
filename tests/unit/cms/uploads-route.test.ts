// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/cms/auth", async (original) => ({ ...(await original<typeof import("@/lib/cms/auth")>()), requireAdmin: auth.requireAdmin }));

import { POST } from "@/app/api/admin/uploads/route";
import { PROJECT_URL, fakeSupabase, media } from "./fake-supabase";

const URL_ = "http://localhost:3000/api/admin/uploads";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const form = (fields: Record<string, string | File>) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.set(k, v); return f; };

let db: ReturnType<typeof fakeSupabase>;
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", PROJECT_URL);
  db = fakeSupabase({ table: "events", rows: [] });
  auth.requireAdmin.mockResolvedValue({ client: db.client, user: { id: "admin" } });
});

describe("POST /api/admin/uploads", () => {
  it("is refused without an admin session", async () => {
    auth.requireAdmin.mockResolvedValue(new Response("{}", { status: 401 }));
    const r = await POST(new Request(URL_, { method: "POST", body: form({ module: "events", recordId: "x", file: new File([PNG], "a.png") }) }));
    expect(r.status).toBe(401);
    expect(db.bucket.upload).not.toHaveBeenCalled();
  });

  it("needs multipart/form-data", async () => {
    const r = await POST(new Request(URL_, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
    expect(r.status).toBe(415);
  });

  it("refuses an oversized body from its declared length before reading it", async () => {
    const r = await POST(new Request(URL_, { method: "POST", headers: { "content-type": "multipart/form-data; boundary=x", "content-length": String(6 * 1024 * 1024) }, body: "--x--" }));
    expect(r.status).toBe(413);
  });

  it("refuses an oversized body that has no Content-Length, without reading it all", async () => {
    let pulled = 0;
    const chunk = new Uint8Array(1024 * 1024);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        if (pulled > 50) controller.close(); else controller.enqueue(chunk);   // up to 50 MB if read to the end
      },
    });
    const r = await POST(new Request(URL_, { method: "POST", headers: { "content-type": "multipart/form-data; boundary=x" }, body: stream, duplex: "half" } as RequestInit));
    expect(r.status).toBe(413);
    expect((await r.json()).error).toBe("The image is larger than 4 MB.");
    expect(pulled).toBeLessThan(10);   // reading stopped just past the limit
    expect(db.bucket.upload).not.toHaveBeenCalled();
  });

  it.each([
    ["JPEG", [0xff, 0xd8, 0xff, 0xe0], "jpg"],
    ["PNG", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "png"],
    ["WebP", [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], "webp"],
  ])("accepts a %s of exactly 4 MB through the streamed multipart path", async (_n, magic, ext) => {
    const bytes = new Uint8Array(4 * 1024 * 1024); bytes.set(magic);
    const r = await POST(new Request(URL_, { method: "POST", body: form({ module: "events", recordId: "spring-fest", file: new File([bytes], "p.bin") }) }));
    expect(r.status).toBe(201);
    expect((await r.json()).data.path).toMatch(new RegExp(`\\.${ext}$`));
  });

  it("refuses a 4 MB + 1 byte image with the same message", async () => {
    const bytes = new Uint8Array(4 * 1024 * 1024 + 1); bytes.set(PNG);
    const r = await POST(new Request(URL_, { method: "POST", body: form({ module: "events", recordId: "spring-fest", file: new File([bytes], "p.png") }) }));
    expect(r.status).toBe(413);
    expect((await r.json()).error).toBe("The image is larger than 4 MB.");
    expect(db.bucket.upload).not.toHaveBeenCalled();
  });

  it("refuses a malformed multipart body", async () => {
    const r = await POST(new Request(URL_, { method: "POST", headers: { "content-type": "multipart/form-data; boundary=x" }, body: "garbage" }));
    expect(r.status).toBe(400);
  });

  it("stores a valid image in the record's own folder and returns its public URL", async () => {
    const r = await POST(new Request(URL_, { method: "POST", body: form({ module: "events", recordId: "spring-fest", file: new File([PNG], "poster.png", { type: "image/png" }) }) }));
    expect(r.status).toBe(201);
    const { data } = await r.json();
    expect(data.path).toMatch(/^events\/spring-fest\/[0-9a-f-]{36}\.png$/);
    expect(data.url).toBe(media(data.path));
    expect(r.headers.get("cache-control")).toContain("no-store");
  });
});
