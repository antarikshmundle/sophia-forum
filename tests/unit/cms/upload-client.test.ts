import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadMedia } from "@/hooks/uploadMedia";

const file = (bytes: number) => new File([new Uint8Array(bytes)], "p.png", { type: "image/png" });
afterEach(() => vi.unstubAllGlobals());

describe("Admin photo upload (browser side)", () => {
  it("refuses a file over 4 MB before sending anything", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await uploadMedia("events", "spring-fest", file(4 * 1024 * 1024 + 1))).toEqual({ ok: false, error: "The image is larger than 4 MB." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a file of exactly 4 MB", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { url: "https://x.supabase.co/a.png" } }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await uploadMedia("events", "spring-fest", file(4 * 1024 * 1024))).toEqual({ ok: true, url: "https://x.supabase.co/a.png" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("explains a 413 from the hosting platform (no JSON body) instead of a bare status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Request Entity Too Large", { status: 413 })));
    const r = await uploadMedia("events", "spring-fest", file(10));
    expect(r).toEqual({ ok: false, error: "The image is too large to upload. Choose an image under 4 MB." });
  });

  it("shows the API's own error message when there is one", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Upload a JPEG, PNG or WebP image." }), { status: 400 })));
    expect(await uploadMedia("events", "spring-fest", file(10))).toEqual({ ok: false, error: "Upload a JPEG, PNG or WebP image." });
  });
});
