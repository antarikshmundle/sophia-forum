// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The middleware (CMS_AUTH_MODE=supabase) checks cookie-carrying requests. An invalid session on /api/auth/session is
// a normal "signed out" answer (200 { data: null }); the protected /api/admin routes and /admin pages stay locked.
const session = vi.hoisted(() => ({
  createSessionClient: vi.fn(() => ({})),
  enforcedCookieOptions: vi.fn((options: object) => options),
  isSupabaseCookie: vi.fn((name: string) => name.startsWith("sb-")),
  publicSupabaseConfig: vi.fn(),
  readAdminSession: vi.fn(),
  REMOVED_COOKIE: { maxAge: 0, path: "/" },
  SESSION_COOKIE: "x",
}));
vi.mock("@/lib/cms/session", () => session);

import { middleware } from "@/middleware";

const req = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost:3000${path}`, { headers: cookie ? { cookie } : {} });

beforeEach(() => {
  vi.stubEnv("CMS_AUTH_MODE", "supabase");
  session.publicSupabaseConfig.mockReturnValue({ url: "https://testproj.supabase.co", publicKey: "sb_publishable_x" });
  session.readAdminSession.mockResolvedValue({ ok: false });
});

describe("middleware with an invalid Supabase session cookie", () => {
  it("/api/auth/session → 200 { data: null } and the cookie is cleared", async () => {
    const r = await middleware(req("/api/auth/session", "sb-testproj-auth-token=stale"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ data: null });
    expect(r.headers.get("cache-control")).toMatch(/no-store/);
    expect(r.cookies.get("sb-testproj-auth-token")?.value).toBe("");
  });

  it("/api/admin/* → still 401", async () => {
    const r = await middleware(req("/api/admin/events", "sb-testproj-auth-token=stale"));
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: "Sign in required." });
  });

  it("/admin → still redirected to /login", async () => {
    const r = await middleware(req("/admin", "sb-testproj-auth-token=stale"));
    expect(r.status).toBe(307);
    expect(r.headers.get("location")).toBe("http://localhost:3000/login?next=%2Fadmin");
  });
});

describe("middleware without a session cookie", () => {
  it("/api/auth/session and /api/admin/* pass through to the route (which answers itself)", async () => {
    for (const path of ["/api/auth/session", "/api/admin/events"]) {
      const r = await middleware(req(path));
      expect(r.headers.get("x-middleware-next")).toBe("1");
    }
    expect(session.readAdminSession).not.toHaveBeenCalled();
  });
});
