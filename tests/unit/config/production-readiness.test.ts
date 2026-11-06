// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assertBuildEnv, buildEnvProblems, mustValidate } from "@/lib/build-env";
import { contentSecurityPolicy, securityHeaders } from "@/lib/security-headers";

const jwt = (payload: object) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.c2lnbmF0dXJl`;
const GOOD = {
  CMS_AUTH_MODE: "supabase",
  CMS_FACULTY_MODE: "backend",
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_abc123",
};

describe("build-time environment validation", () => {
  it("accepts a complete backend environment (publishable or legacy anon key)", () => {
    expect(buildEnvProblems(GOOD)).toEqual([]);
    expect(buildEnvProblems({ ...GOOD, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt({ role: "anon" }) })).toEqual([]);
    expect(() => assertBuildEnv(GOOD)).not.toThrow();
  });

  it("refuses an empty environment instead of silently building the demo site", () => {
    expect(buildEnvProblems({})).toEqual([
      'CMS_AUTH_MODE must be "supabase"',
      'CMS_FACULTY_MODE must be "backend"',
      "NEXT_PUBLIC_SUPABASE_URL must be https://<project-ref>.supabase.co",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY is missing",
    ]);
    expect(() => assertBuildEnv({})).toThrow(/Production build refused/);
  });

  it.each([
    ["demo auth mode", { CMS_AUTH_MODE: "demo" }, /CMS_AUTH_MODE/],
    ["demo faculty mode", { CMS_FACULTY_MODE: "demo" }, /CMS_FACULTY_MODE/],
    ["a non-Supabase URL", { NEXT_PUBLIC_SUPABASE_URL: "https://example.com" }, /NEXT_PUBLIC_SUPABASE_URL/],
    ["an http URL", { NEXT_PUBLIC_SUPABASE_URL: "http://abcdefghijklmnopqrst.supabase.co" }, /NEXT_PUBLIC_SUPABASE_URL/],
    ["a secret key", { NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_secret_abc" }, /secret\/service-role/],
    ["a service-role JWT", { NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt({ role: "service_role" }) }, /secret\/service-role/],
    ["an unknown key format", { NEXT_PUBLIC_SUPABASE_ANON_KEY: "abc" }, /publishable/],
    ["a secret in another NEXT_PUBLIC_ variable", { NEXT_PUBLIC_EXTRA: "sb_secret_leak" }, /NEXT_PUBLIC_EXTRA looks like a secret/],
  ])("refuses %s", (_label, change, message) => {
    expect(buildEnvProblems({ ...GOOD, ...change }).join("\n")).toMatch(message);
  });

  it("refuses the staging project on a Vercel production deployment only", () => {
    const staging = { ...GOOD, NEXT_PUBLIC_SUPABASE_URL: "https://mqvhuvtakzrnvuvkkgyt.supabase.co" };
    expect(buildEnvProblems(staging)).toEqual([]);
    expect(buildEnvProblems({ ...staging, VERCEL_ENV: "production" })).toEqual(["NEXT_PUBLIC_SUPABASE_URL points at the staging project in a production deployment"]);
  });

  it("allows a local demo build only with the explicit opt-out, and never on Vercel production", () => {
    expect(mustValidate({})).toBe(true);
    expect(mustValidate({ SOPHIA_ALLOW_DEMO_BUILD: "1" })).toBe(false);
    expect(mustValidate({ SOPHIA_ALLOW_DEMO_BUILD: "true" })).toBe(true);
    expect(mustValidate({ SOPHIA_ALLOW_DEMO_BUILD: "1", VERCEL_ENV: "production" })).toBe(true);
    expect(() => assertBuildEnv({ SOPHIA_ALLOW_DEMO_BUILD: "1" })).not.toThrow();
    expect(() => assertBuildEnv({ SOPHIA_ALLOW_DEMO_BUILD: "1", VERCEL_ENV: "production" })).toThrow();
  });

  it("never puts a value into the error", () => {
    let message = "";
    try { assertBuildEnv({ ...GOOD, NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_secret_TOPSECRET" }); } catch (e) { message = (e as Error).message; }
    expect(message).toMatch(/refused/);
    expect(message).not.toContain("TOPSECRET");
  });
});

describe("security headers", () => {
  const headers = Object.fromEntries(securityHeaders({ supabaseHost: "abcdefghijklmnopqrst.supabase.co", dev: false }).map((h) => [h.key, h.value]));

  it("sends the enforced headers", () => {
    expect(headers["Strict-Transport-Security"]).toBe("max-age=31536000; includeSubDomains");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Permissions-Policy"]).toMatch(/camera=\(\).*microphone=\(\).*geolocation=\(\)/);
    expect(headers["Permissions-Policy"]).not.toMatch(/fullscreen|autoplay/);   // the YouTube player keeps them
  });

  it("sends the CSP as report-only (nothing is blocked yet)", () => {
    expect(headers["Content-Security-Policy"]).toBeUndefined();
    expect(headers["Content-Security-Policy-Report-Only"]).toBeDefined();
  });

  it("the CSP allows exactly what the site loads", () => {
    const csp = contentSecurityPolicy({ supabaseHost: "abcdefghijklmnopqrst.supabase.co", dev: false });
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");   // inline layout script + Next.js bootstrap
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("img-src 'self' data: blob: https://img.youtube.com https://abcdefghijklmnopqrst.supabase.co");
    expect(csp).not.toContain("imagekit");
    expect(csp).toContain("frame-src https://www.youtube-nocookie.com https://www.youtube.com");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("dev adds eval and the HMR websocket; no Supabase host means no Supabase source", () => {
    const csp = contentSecurityPolicy({ supabaseHost: null, dev: true });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("connect-src 'self' ws: wss:");
    expect(csp).not.toContain("supabase.co");
  });
});
