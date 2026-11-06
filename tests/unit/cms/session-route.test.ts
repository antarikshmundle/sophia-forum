// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// GET /api/auth/session: "signed out" is a normal 200 { data: null } answer (no browser console error on public pages)
const session = vi.hoisted(() => ({
  createSessionClient: vi.fn((_config: unknown, _store: unknown, _pending: { name: string; value: string; options: object }[]) => ({})),
  enforcedCookieOptions: vi.fn((options: object) => ({ ...options, httpOnly: true })),
  isSupabaseCookie: vi.fn((name: string) => name.startsWith("sb-")),
  publicSupabaseConfig: vi.fn(),
  readAdminSession: vi.fn(),
  REMOVED_COOKIE: { maxAge: 0, path: "/" },
}));
vi.mock("@/lib/cms/session", () => session);

const jar = vi.hoisted(() => ({ cookies: [] as { name: string; value: string }[], set: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => jar.cookies, set: jar.set }) }));

import { GET } from "@/app/api/auth/session/route";

beforeEach(() => {
  vi.stubEnv("CMS_AUTH_MODE", "supabase");
  session.publicSupabaseConfig.mockReturnValue({ url: "https://testproj.supabase.co", publicKey: "sb_publishable_x" });
  jar.cookies = [];
  jar.set.mockClear();
});

describe("GET /api/auth/session", () => {
  it("signed out (no cookie): 200 { data: null }, nothing set", async () => {
    session.readAdminSession.mockResolvedValue({ ok: false });
    const r = await GET();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ data: null });
    expect(r.headers.get("cache-control")).toMatch(/no-store/);
    expect(jar.set).not.toHaveBeenCalled();
  });

  it("stale or invalid Supabase cookies: 200 { data: null } and every sb- cookie is cleared (others untouched)", async () => {
    jar.cookies = [{ name: "sb-testproj-auth-token", value: "stale" }, { name: "sophia_demo_session", value: "x" }];
    session.readAdminSession.mockResolvedValue({ ok: false });
    const r = await GET();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ data: null });
    expect(jar.set).toHaveBeenCalledTimes(1);
    expect(jar.set).toHaveBeenCalledWith("sb-testproj-auth-token", "", session.REMOVED_COOKIE);
  });

  it("signed-in admin: 200 with the session (no tokens) and refreshed cookies re-written", async () => {
    const admin = { email: "admin@example.invalid", name: "Admin", role: "admin" };
    session.readAdminSession.mockImplementation(async () => ({ ok: true, session: admin, deadline: 123 }));
    session.createSessionClient.mockImplementation((_config, _store, pending) => {
      pending.push({ name: "sb-testproj-auth-token", value: "fresh", options: { path: "/" } });
      return {};
    });
    const r = await GET();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ data: admin });
    expect(jar.set).toHaveBeenCalledWith("sb-testproj-auth-token", "fresh", expect.objectContaining({ httpOnly: true }));
  });

  it("demo build: 404 (the endpoint does not exist)", async () => {
    vi.stubEnv("CMS_AUTH_MODE", "demo");
    expect((await GET()).status).toBe(404);
  });

  it("sign-in not configured: 503", async () => {
    session.publicSupabaseConfig.mockReturnValue(null);
    expect((await GET()).status).toBe(503);
  });
});
