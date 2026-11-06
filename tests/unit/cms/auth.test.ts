// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const server = vi.hoisted(() => ({ supabaseConfig: vi.fn(), createTokenClient: vi.fn(), createCookieClient: vi.fn() }));
vi.mock("@/lib/cms/supabase-server", () => server);

import { crossSiteReason, requireAdmin } from "@/lib/cms/auth";

const ORIGIN = "http://localhost:3000";
const req = (method: string, headers: Record<string, string> = {}) => new Request(`${ORIGIN}/api/admin/events`, { method, headers });

/** A signed-in user (or none) with a profiles row (or none). */
function authClient({ user = { id: "u1" } as { id: string } | null, role = "admin" as string | null, profileError = false } = {}) {
  const profileQuery = {
    select: () => profileQuery,
    eq: () => profileQuery,
    maybeSingle: async () => (profileError ? { data: null, error: { code: "42501" } } : { data: role ? { role } : null, error: null }),
  };
  return {
    auth: { getUser: vi.fn(async () => (user ? { data: { user }, error: null } : { data: { user: null }, error: { message: "invalid JWT" } })) },
    from: vi.fn(() => profileQuery),
  };
}

beforeEach(() => {
  vi.stubEnv("CMS_FACULTY_MODE", "backend");
  server.supabaseConfig.mockReturnValue({ url: "https://testproj.supabase.co", publicKey: "sb_publishable_x" });
});

describe("crossSiteReason", () => {
  it("allows same-origin and bearer requests, refuses cross-site ones", () => {
    expect(crossSiteReason(req("POST", { origin: ORIGIN, "sec-fetch-site": "same-origin" }), false)).toBeNull();
    expect(crossSiteReason(req("POST", { origin: "https://evil.example" }), false)).toBe("origin mismatch");
    expect(crossSiteReason(req("POST", { origin: ORIGIN, "sec-fetch-site": "cross-site" }), false)).toBe("cross-site");
    expect(crossSiteReason(req("POST", { "sec-fetch-site": "same-site" }), true)).toBe("cross-site");
    expect(crossSiteReason(req("POST"), false)).toBe("missing origin");
    expect(crossSiteReason(req("POST"), true)).toBeNull();
  });
});

describe("requireAdmin", () => {
  it("hides the API (404) unless CMS_FACULTY_MODE=backend", async () => {
    vi.stubEnv("CMS_FACULTY_MODE", "demo");
    const r = await requireAdmin(req("GET"));
    expect(r).toBeInstanceOf(Response);
    expect((r as Response).status).toBe(404);
    expect(server.createCookieClient).not.toHaveBeenCalled();
  });

  it("refuses a malformed Authorization header", async () => {
    expect(((await requireAdmin(req("GET", { authorization: "Basic abc" }))) as Response).status).toBe(401);
    expect(((await requireAdmin(req("GET", { authorization: "Bearer a b" }))) as Response).status).toBe(401);
  });

  it("refuses a cross-site write before any Supabase call", async () => {
    const r = (await requireAdmin(req("DELETE", { origin: "https://evil.example" }))) as Response;
    expect(r.status).toBe(403);
    expect(server.createCookieClient).not.toHaveBeenCalled();
  });

  it("returns 503 when Supabase isn't configured", async () => {
    server.supabaseConfig.mockReturnValue(null);
    expect(((await requireAdmin(req("GET"))) as Response).status).toBe(503);
  });

  it("returns 401 without a valid session", async () => {
    server.createCookieClient.mockResolvedValue(authClient({ user: null }));
    expect(((await requireAdmin(req("GET"))) as Response).status).toBe(401);
    server.createTokenClient.mockReturnValue(authClient({ user: null }));
    expect(((await requireAdmin(req("GET", { authorization: "Bearer forged.token.value" }))) as Response).status).toBe(401);
  });

  it.each([["a non-admin role", "manager", false], ["no profile", null, false], ["an unreadable profile", "admin", true]])("returns 403 for %s", async (_l, role, profileError) => {
    server.createCookieClient.mockResolvedValue(authClient({ role, profileError }));
    expect(((await requireAdmin(req("GET"))) as Response).status).toBe(403);
  });

  it("returns the user's client for an admin (cookie session, and bearer token verified with that token)", async () => {
    const cookieClient = authClient();
    server.createCookieClient.mockResolvedValue(cookieClient);
    const viaCookie = await requireAdmin(req("POST", { origin: ORIGIN }));
    expect(viaCookie).toMatchObject({ client: cookieClient, user: { id: "u1" } });

    const tokenClient = authClient();
    server.createTokenClient.mockReturnValue(tokenClient);
    const viaToken = await requireAdmin(req("POST", { authorization: "Bearer good.token" }));
    expect(viaToken).toMatchObject({ client: tokenClient });
    expect(tokenClient.auth.getUser).toHaveBeenCalledWith("good.token");
  });

  it("sends no-store headers on refusals", async () => {
    server.createCookieClient.mockResolvedValue(authClient({ user: null }));
    const r = (await requireAdmin(req("GET"))) as Response;
    expect(r.headers.get("cache-control")).toContain("no-store");
  });
});
