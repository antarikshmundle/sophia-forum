// @vitest-environment node
import { describe, expect, it } from "vitest";
import { botAvailability } from "@/lib/bot/config";
import { clientKeyOf, MemoryRateLimiter } from "@/lib/bot/ratelimit";
import { buildEnvProblems } from "@/lib/build-env";
import { SophiaBot } from "@/components/bot/SophiaBot";

const ON = { SOPHIA_BOT_ENABLED: "true", GEMINI_API_KEY: "test-key-not-real", GEMINI_MODEL: "test-model-1.0" };

describe("feature flag and configuration", () => {
  it("is off by default and for anything but exactly \"true\"", () => {
    expect(botAvailability({})).toEqual({ enabled: false, reason: "flag-off" });
    for (const v of ["", "1", "yes", "TRUE", "false"]) expect(botAvailability({ ...ON, SOPHIA_BOT_ENABLED: v })).toEqual({ enabled: false, reason: "flag-off" });
  });

  it("fails safe without a key or a valid model ID", () => {
    expect(botAvailability({ ...ON, GEMINI_API_KEY: undefined })).toEqual({ enabled: false, reason: "missing-api-key" });
    expect(botAvailability({ ...ON, GEMINI_API_KEY: "   " })).toEqual({ enabled: false, reason: "missing-api-key" });
    for (const m of [undefined, "", "../secrets", "models/x?key=1", "Has Space"]) {
      expect(botAvailability({ ...ON, GEMINI_MODEL: m })).toEqual({ enabled: false, reason: "missing-model" });
    }
  });

  it("stays off on a production deployment until the rate limiter is shared", () => {
    expect(botAvailability({ ...ON, VERCEL_ENV: "production" }, "memory")).toEqual({ enabled: false, reason: "shared-rate-limit-required" });
    expect(botAvailability({ ...ON, VERCEL_ENV: "production" }, "shared")).toMatchObject({ enabled: true });
    expect(botAvailability({ ...ON, VERCEL_ENV: "preview" }, "memory")).toMatchObject({ enabled: true });
    expect(botAvailability({ ...ON, VERCEL_ENV: "preview" }, "invalid")).toEqual({ enabled: false, reason: "rate-limit-misconfigured" });
  });

  it("enabled: the key and model are returned to the server code only", () => {
    expect(botAvailability(ON)).toEqual({ enabled: true, apiKey: "test-key-not-real", model: "test-model-1.0" });
  });

  it("the layout gate renders nothing unless the bot is available", () => {
    expect(SophiaBot()).toBeNull(); // test setup: no flag
  });
});

describe("build guard: Gemini settings are never NEXT_PUBLIC_", () => {
  const base = { CMS_AUTH_MODE: "supabase", CMS_FACULTY_MODE: "backend", NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_x" };
  it("refuses a NEXT_PUBLIC_ Gemini variable or a Google API key in any NEXT_PUBLIC_ variable", () => {
    expect(buildEnvProblems(base)).toEqual([]);
    expect(buildEnvProblems({ ...base, NEXT_PUBLIC_GEMINI_API_KEY: "anything" }).join()).toMatch(/NEXT_PUBLIC_GEMINI_API_KEY: the Gemini key/);
    expect(buildEnvProblems({ ...base, NEXT_PUBLIC_GEMINI_MODEL: "x" }).join()).toMatch(/server-only/);
    expect(buildEnvProblems({ ...base, NEXT_PUBLIC_ANALYTICS: "AIza" + "x".repeat(35) }).join()).toMatch(/looks like a secret key/);
  });
  it("server-only Gemini variables are fine", () => {
    expect(buildEnvProblems({ ...base, ...ON })).toEqual([]);
  });
});

describe("MemoryRateLimiter", () => {
  it("allows the per-client limit, then blocks with Retry-After until the window ends", async () => {
    const l = new MemoryRateLimiter({ client: [{ limit: 3, windowMs: 60_000 }], global: [{ limit: 100, windowMs: 60_000 }] });
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect((await l.take("a", t0 + i)).allowed).toBe(true);
    expect(await l.take("a", t0 + 10_000)).toEqual({ allowed: false, retryAfterSeconds: 50, scope: "client" });
    expect((await l.take("b", t0 + 10_000)).allowed).toBe(true); // another client is independent
    expect((await l.take("a", t0 + 60_000)).allowed).toBe(true); // new window
  });

  it("applies every rule (minute and hour)", async () => {
    const l = new MemoryRateLimiter({ client: [{ limit: 5, windowMs: 60_000 }, { limit: 6, windowMs: 3_600_000 }], global: [{ limit: 100, windowMs: 60_000 }] });
    for (let i = 0; i < 5; i++) expect((await l.take("a", i)).allowed).toBe(true);
    expect((await l.take("a", 61_000)).allowed).toBe(true); // 6th, new minute
    const blocked = await l.take("a", 122_000);
    expect(blocked).toMatchObject({ allowed: false, scope: "client" });
    expect(blocked.retryAfterSeconds).toBe(3_600 - 122);
  });

  it("has a global cap across all clients", async () => {
    const l = new MemoryRateLimiter({ client: [{ limit: 10, windowMs: 60_000 }], global: [{ limit: 2, windowMs: 60_000 }] });
    expect((await l.take("a", 0)).allowed).toBe(true);
    expect((await l.take("b", 0)).allowed).toBe(true);
    expect(await l.take("c", 0)).toMatchObject({ allowed: false, scope: "global" });
  });

  it("is honest about being per-instance, and keeps only salted hashes in memory", async () => {
    const l = new MemoryRateLimiter();
    expect(l.distributed).toBe(false);
    await l.take("ip:203.0.113.7");
    const keys = [...(l as unknown as { windows: Map<string, unknown> }).windows.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toContain("203.0.113.7");
    expect(keys[0]).toMatch(/^[0-9a-f]{32}$/);
  });

  it("bounds memory: old clients are dropped beyond maxKeys", async () => {
    const l = new MemoryRateLimiter({ maxKeys: 3 });
    for (let i = 0; i < 10; i++) await l.take(`c${i}`, i);
    expect((l as unknown as { windows: Map<string, unknown> }).windows.size).toBeLessThanOrEqual(3);
  });
});

describe("clientKeyOf", () => {
  const req = (headers: Record<string, string>) => new Request("https://site.example/api/bot/chat", { method: "POST", headers });
  it("uses Vercel's x-real-ip only on Vercel; never trusts forwarded headers elsewhere", () => {
    expect(clientKeyOf(req({ "x-real-ip": "203.0.113.7" }), { VERCEL: "1" })).toBe("ip:203.0.113.7");
    expect(clientKeyOf(req({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.2.3.4" }), {})).toBe("local");
    expect(clientKeyOf(req({}), { VERCEL: "1" })).toBe("local");
  });
});
