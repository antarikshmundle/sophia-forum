// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KnowledgeChunk } from "@/lib/bot/knowledge/types";

/**
 * Distributed rate limiting with Upstash Redis. A fake Upstash REST endpoint implements the documented /multi-exec
 * contract (POST, Bearer token, body [["CMD", …], …], reply [{"result": …} | {"error": …}, …] or one {"error": …} when
 * the transaction is discarded; 401 on a bad token) over one shared in-memory store, so two limiter objects stand for
 * two server instances sharing Redis. No network.
 */
const cms = vi.hoisted(() => ({ chunks: [] as KnowledgeChunk[] }));
vi.mock("@/lib/bot/knowledge/cms-source", () => ({ loadCmsKnowledge: async () => ({ ok: true, chunks: cms.chunks, failed: [] }) }));

import { botAvailability } from "@/lib/bot/config";
import { botRateLimiter, MemoryRateLimiter, rateLimitSetup, resetBotRateLimiter, UNAVAILABLE_RETRY_SECONDS, UpstashRateLimiter } from "@/lib/bot/ratelimit";
import { buildEnvProblems } from "@/lib/build-env";
import { POST } from "@/app/api/bot/chat/route";
import { resetKnowledgeCache } from "@/lib/bot/sources";

const URL_ = "https://example-db-12345.upstash.io";
const TOKEN = "AbCdTestTokenNotReal_0123456789xyz=";
const ON = { SOPHIA_BOT_ENABLED: "true", GEMINI_API_KEY: "test-gemini-key-not-real", GEMINI_MODEL: "test-model-1.0" };
const UPSTASH = { UPSTASH_REDIS_REST_URL: URL_, UPSTASH_REDIS_REST_TOKEN: TOKEN };

type Mode = "ok" | "http500" | "discard" | "command-error" | "malformed" | "short" | "hang" | "network";

function fakeUpstash(token = TOKEN) {
  const store = new Map<string, number>();
  const ttl = new Map<string, number>();
  const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
  const state = { mode: "ok" as Mode };
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    calls.push({ url, headers, body: String(init.body) });
    const reply = (body: unknown, status = 200) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (state.mode === "network") throw new TypeError("fetch failed");
    if (state.mode === "hang") {
      return new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    }
    if (state.mode === "http500") return reply({ error: "ERR internal" }, 500);
    if (headers.Authorization !== `Bearer ${token}`) return reply({ error: "WRONGPASS invalid password" }, 401);
    if (init.method !== "POST" || !url.endsWith("/multi-exec")) return reply({ error: "ERR unexpected" }, 400);
    if (state.mode === "discard") return reply({ error: "ERR max daily request limit exceeded" });
    if (state.mode === "malformed") return reply("<html>gateway</html>");
    const commands = JSON.parse(String(init.body)) as string[][];
    if (state.mode === "short") return reply([{ result: 1 }]);
    const out = commands.map(([cmd, key, arg], i) => {
      if (state.mode === "command-error" && i === 0) return { error: "WRONGTYPE Operation against a key holding the wrong kind of value" };
      if (cmd === "INCR") { const v = (store.get(key) ?? 0) + 1; store.set(key, v); return { result: v }; }
      if (cmd === "PEXPIRE") { ttl.set(key, Number(arg)); return { result: 1 }; }
      return { error: `ERR unknown command '${cmd}'` };
    });
    return reply(out);
  });
  return { store, ttl, calls, state, fetchImpl: fetchImpl as unknown as typeof fetch };
}

const T0 = Date.UTC(2026, 10, 13, 10, 0, 0); // on a minute and hour boundary

beforeEach(() => {
  resetBotRateLimiter();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("configuration (server-only variables)", () => {
  it("selects Upstash only with both valid credentials; neither = per-instance memory; anything else = invalid", () => {
    expect(rateLimitSetup({})).toEqual({ kind: "memory" });
    expect(rateLimitSetup(UPSTASH)).toEqual({ kind: "upstash", url: URL_, token: TOKEN });
    expect(rateLimitSetup({ ...UPSTASH, UPSTASH_REDIS_REST_URL: URL_ + "/" })).toMatchObject({ kind: "upstash", url: URL_ });
    for (const env of [
      { UPSTASH_REDIS_REST_URL: URL_ },
      { UPSTASH_REDIS_REST_TOKEN: TOKEN },
      { ...UPSTASH, UPSTASH_REDIS_REST_URL: "http://example-db-12345.upstash.io" },
      { ...UPSTASH, UPSTASH_REDIS_REST_URL: "https://evil.example/upstash.io" },
      { ...UPSTASH, UPSTASH_REDIS_REST_URL: "https://upstash.io.evil.example" },
      { ...UPSTASH, UPSTASH_REDIS_REST_URL: "https://user:pw@example-db.upstash.io" },
      { ...UPSTASH, UPSTASH_REDIS_REST_TOKEN: "short" },
      { ...UPSTASH, UPSTASH_REDIS_REST_TOKEN: "has spaces in the token value!!" },
    ]) {
      const setup = rateLimitSetup(env);
      expect(setup.kind).toBe("invalid");
      if (setup.kind === "invalid") expect(setup.problem).not.toContain(TOKEN);
    }
  });

  it("availability: production needs Upstash; a half or malformed configuration keeps the bot off everywhere", () => {
    expect(botAvailability({ ...ON, ...UPSTASH, VERCEL_ENV: "production" })).toMatchObject({ enabled: true });
    expect(botAvailability({ ...ON, VERCEL_ENV: "production" })).toEqual({ enabled: false, reason: "shared-rate-limit-required" });
    expect(botAvailability({ ...ON, UPSTASH_REDIS_REST_URL: URL_, VERCEL_ENV: "production" })).toEqual({ enabled: false, reason: "rate-limit-misconfigured" });
    expect(botAvailability({ ...ON, UPSTASH_REDIS_REST_URL: URL_ })).toEqual({ enabled: false, reason: "rate-limit-misconfigured" });
    expect(botAvailability({ ...ON })).toMatchObject({ enabled: true }); // local/preview: per-instance memory
    expect(botAvailability({ ...UPSTASH })).toEqual({ enabled: false, reason: "flag-off" }); // credentials alone never enable it
  });

  it("botRateLimiter picks the implementation from the environment", () => {
    expect(botRateLimiter({ ...UPSTASH })).toBeInstanceOf(UpstashRateLimiter);
    expect(botRateLimiter({ ...UPSTASH })?.distributed).toBe(true);
    expect(botRateLimiter({})).toBeInstanceOf(MemoryRateLimiter);
    expect(botRateLimiter({ UPSTASH_REDIS_REST_TOKEN: TOKEN })).toBeNull();
  });

  it("build guard: Upstash credentials are never NEXT_PUBLIC_", () => {
    const base = { CMS_AUTH_MODE: "supabase", CMS_FACULTY_MODE: "backend", NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_x" };
    expect(buildEnvProblems({ ...base, ...UPSTASH })).toEqual([]);
    for (const name of ["NEXT_PUBLIC_UPSTASH_REDIS_REST_TOKEN", "NEXT_PUBLIC_UPSTASH_REDIS_REST_URL", "NEXT_PUBLIC_KV_REST_API_TOKEN", "NEXT_PUBLIC_REDIS_URL"]) {
      const problems = buildEnvProblems({ ...base, [name]: "x" });
      expect(problems.join()).toMatch(new RegExp(`${name}: rate-limit store credentials are server-only`));
      expect(problems.join()).not.toContain(TOKEN);
    }
  });
});

describe("UpstashRateLimiter: request format", () => {
  it("one MULTI/EXEC per check, Bearer token in the header only, hashed visitor ids, expiry of two windows", async () => {
    const f = fakeUpstash();
    const l = new UpstashRateLimiter({ url: URL_, token: TOKEN, fetchImpl: f.fetchImpl });
    expect(await l.take("ip:203.0.113.7", T0)).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(f.calls).toHaveLength(2); // visitor windows, then the server-wide window
    for (const c of f.calls) {
      expect(c.url).toBe(`${URL_}/multi-exec`);
      expect(c.headers.Authorization).toBe(`Bearer ${TOKEN}`);
      expect(c.url + c.body).not.toContain(TOKEN);
      expect(c.body).not.toContain("203.0.113.7");
    }
    const visitor = JSON.parse(f.calls[0].body) as string[][];
    expect(visitor.map((c) => c[0])).toEqual(["INCR", "PEXPIRE", "INCR", "PEXPIRE"]);
    expect(visitor[0][1]).toMatch(/^sophia-bot:rl:v1:c:[0-9a-f]{32}:60000:\d+$/);
    expect(visitor[2][1]).toMatch(/^sophia-bot:rl:v1:c:[0-9a-f]{32}:3600000:\d+$/);
    expect(visitor[1]).toEqual(["PEXPIRE", visitor[0][1], "120000"]);
    expect(visitor[3]).toEqual(["PEXPIRE", visitor[2][1], "7200000"]);
    expect(JSON.parse(f.calls[1].body)[0][1]).toMatch(/^sophia-bot:rl:v1:g:60000:\d+$/);
  });
});

describe("UpstashRateLimiter: success and rejection", () => {
  it("6 questions a minute per visitor, then 429-style refusal until the minute ends; other visitors unaffected", async () => {
    const f = fakeUpstash();
    const l = new UpstashRateLimiter({ url: URL_, token: TOKEN, fetchImpl: f.fetchImpl });
    for (let i = 0; i < 6; i++) expect((await l.take("ip:a", T0 + i * 1000)).allowed).toBe(true);
    expect(await l.take("ip:a", T0 + 20_000)).toEqual({ allowed: false, retryAfterSeconds: 40, scope: "client" });
    expect((await l.take("ip:b", T0 + 20_000)).allowed).toBe(true);
    expect((await l.take("ip:a", T0 + 60_000)).allowed).toBe(true); // next minute
  });

  it("40 an hour per visitor", async () => {
    const f = fakeUpstash();
    const l = new UpstashRateLimiter({ url: URL_, token: TOKEN, fetchImpl: f.fetchImpl, global: [{ limit: 1000, windowMs: 60_000 }] });
    let t = T0;
    for (let i = 0; i < 40; i++) {
      if (i > 0 && i % 6 === 0) t += 60_000; // stay under the per-minute limit
      expect((await l.take("ip:a", t + (i % 6) * 1000)).allowed).toBe(true);
    }
    const now = t + 120_000;
    expect(await l.take("ip:a", now)).toEqual({ allowed: false, retryAfterSeconds: Math.ceil((T0 + 3_600_000 - now) / 1000), scope: "client" });
  });

  it("counters are shared: two server instances enforce one limit per visitor", async () => {
    const f = fakeUpstash();
    const a = new UpstashRateLimiter({ url: URL_, token: TOKEN, fetchImpl: f.fetchImpl });
    const b = new UpstashRateLimiter({ url: URL_, token: TOKEN, fetchImpl: f.fetchImpl });
    for (let i = 0; i < 3; i++) {
      expect((await a.take("ip:a", T0 + i)).allowed).toBe(true);
      expect((await b.take("ip:a", T0 + i)).allowed).toBe(true);
    }
    expect((await a.take("ip:a", T0 + 10)).allowed).toBe(false);
    expect((await b.take("ip:a", T0 + 10)).allowed).toBe(false);
  });

  it("the server-wide safety limit is shared across instances and visitors", async () => {
    const f = fakeUpstash();
    const opts = { url: URL_, token: TOKEN, fetchImpl: f.fetchImpl, global: [{ limit: 3, windowMs: 60_000 }] };
    const a = new UpstashRateLimiter(opts);
    const b = new UpstashRateLimiter(opts);
    expect((await a.take("ip:1", T0)).allowed).toBe(true);
    expect((await b.take("ip:2", T0)).allowed).toBe(true);
    expect((await a.take("ip:3", T0)).allowed).toBe(true);
    expect(await b.take("ip:4", T0 + 30_000)).toEqual({ allowed: false, retryAfterSeconds: 30, scope: "global" });
  });

  it("a visitor over their own limit does not use up the server-wide budget", async () => {
    const f = fakeUpstash();
    const l = new UpstashRateLimiter({ url: URL_, token: TOKEN, fetchImpl: f.fetchImpl, global: [{ limit: 8, windowMs: 60_000 }] });
    for (let i = 0; i < 20; i++) await l.take("ip:abuser", T0 + i);
    const globalKey = [...f.store.keys()].find((k) => k.includes(":g:"))!;
    expect(f.store.get(globalKey)).toBe(6);
    expect((await l.take("ip:other", T0 + 100)).allowed).toBe(true);
  });
});

describe("UpstashRateLimiter: fail closed", () => {
  it.each<[string, Mode]>([
    ["HTTP 500", "http500"],
    ["a discarded transaction ({\"error\"})", "discard"],
    ["a command error inside the transaction", "command-error"],
    ["a non-JSON reply", "malformed"],
    ["a reply of the wrong length", "short"],
    ["a network failure", "network"],
  ])("%s → refused as unavailable (never allowed, never counted in memory)", async (_, mode) => {
    const f = fakeUpstash();
    f.state.mode = mode;
    const l = new UpstashRateLimiter({ url: URL_, token: TOKEN, fetchImpl: f.fetchImpl });
    expect(await l.take("ip:a", T0)).toEqual({ allowed: false, retryAfterSeconds: UNAVAILABLE_RETRY_SECONDS, scope: "unavailable" });
  });

  it("a rejected token (401) → unavailable", async () => {
    const f = fakeUpstash("the-real-token-is-different-000000");
    const l = new UpstashRateLimiter({ url: URL_, token: TOKEN, fetchImpl: f.fetchImpl });
    expect(await l.take("ip:a", T0)).toMatchObject({ allowed: false, scope: "unavailable" });
  });

  it("a timeout → unavailable, within the timeout", async () => {
    const f = fakeUpstash();
    f.state.mode = "hang";
    const l = new UpstashRateLimiter({ url: URL_, token: TOKEN, fetchImpl: f.fetchImpl, timeoutMs: 30 });
    const started = Date.now();
    expect(await l.take("ip:a", T0)).toMatchObject({ allowed: false, scope: "unavailable" });
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("failure logs name the kind of failure only, never the token or the visitor", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const mode of ["http500", "network", "malformed", "command-error"] as Mode[]) {
      const f = fakeUpstash();
      f.state.mode = mode;
      await new UpstashRateLimiter({ url: URL_, token: TOKEN, fetchImpl: f.fetchImpl }).take("ip:203.0.113.7", T0);
    }
    expect(errors).toHaveBeenCalled();
    for (const call of errors.mock.calls) {
      const line = call.join(" ");
      expect(line).not.toContain(TOKEN);
      expect(line).not.toContain("203.0.113.7");
    }
  });
});

describe("POST /api/bot/chat with Upstash", () => {
  const ORIGIN = "https://sophia.example";
  let upstash: ReturnType<typeof fakeUpstash>;
  let geminiCalls = 0;

  beforeEach(() => {
    resetKnowledgeCache();
    cms.chunks = [{
      id: "cms/events/hack#0", docId: "cms/events/hack", source: "cms", title: "Example Hackathon", heading: "", text: "Example Hackathon: a Sophia Forum event (upcoming).",
      category: "events", scope: "aids", language: "en", sourceUrl: "/events/hack", verifiedOn: null, reviewBy: null, keywords: [], links: [],
    }];
    upstash = fakeUpstash();
    geminiCalls = 0;
    for (const [k, v] of Object.entries({ ...ON, ...UPSTASH, VERCEL_ENV: "production", VERCEL: "1" })) vi.stubEnv(k, v);
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      if (url.startsWith(URL_)) return upstash.fetchImpl(url, init);
      geminiCalls++;
      const reply = { answered: true, answer: "Example Hackathon: a Sophia Forum event (upcoming).", citations: ["S1"] };
      return new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(reply) }] } }] }));
    }));
  });

  const post = (ip = "203.0.113.9") => POST(new Request(`${ORIGIN}/api/bot/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, "Sec-Fetch-Site": "same-origin", "x-real-ip": ip },
    body: JSON.stringify({ message: "When is the hackathon?" }),
  }));

  it("production with Upstash: enabled; answers are still grounded and cited", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ fallback: null, sources: [{ url: "/events/hack" }] });
    expect(upstash.calls.length).toBe(2);
  });

  it("6 a minute per visitor across the deployment, then 429 with Retry-After", async () => {
    for (let i = 0; i < 6; i++) expect((await post()).status).toBe(200);
    const res = await post();
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect((await post("198.51.100.4")).status).toBe(200); // another visitor
    expect(geminiCalls).toBe(7);
  });

  it.each<[Mode]>([["http500"], ["network"], ["discard"]])("Upstash unavailable (%s) → 503, fail closed, Gemini never called", async (mode) => {
    upstash.state.mode = mode;
    const res = await post();
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe(String(UNAVAILABLE_RETRY_SECONDS));
    expect(res.headers.get("Cache-Control")).toMatch(/no-store/);
    expect(await res.json()).toEqual({ error: "Sophia Bot is temporarily unavailable. Please try again shortly." });
    expect(geminiCalls).toBe(0);
  });

  it("production without Upstash, or with half of it: 404 and no traffic to either service", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    expect((await post()).status).toBe(404);
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    expect((await post()).status).toBe(404);
    expect(upstash.calls).toHaveLength(0);
    expect(geminiCalls).toBe(0);
  });

  it("the flag still controls everything: Upstash configured but SOPHIA_BOT_ENABLED unset → 404", async () => {
    vi.stubEnv("SOPHIA_BOT_ENABLED", "");
    expect((await post()).status).toBe(404);
    expect(upstash.calls).toHaveLength(0);
  });
});
