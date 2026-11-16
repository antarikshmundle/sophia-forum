import { createHash, createHmac, randomBytes } from "node:crypto";

/**
 * Rate limiting for /api/bot/chat behind one interface (RateLimiter), with two implementations:
 *
 *  UpstashRateLimiter  DISTRIBUTED: counters live in Upstash Redis, shared by every server instance. Used whenever
 *                      UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set (server-only). If Upstash can't be
 *                      reached, times out or answers unexpectedly, the request is REFUSED (fail closed: 503), never
 *                      let through and never counted in memory instead.
 *  MemoryRateLimiter   PER SERVER INSTANCE: counters live in this process and reset on cold start. NOT distributed.
 *                      Only used when no Upstash credentials are set at all, and never on a Vercel production
 *                      deployment (config.ts keeps the bot off there: "shared-rate-limit-required").
 *
 * Limits (both implementations): per visitor 6 questions a minute and 40 an hour; server-wide 60 a minute (a cost
 * guard: per process for memory, across all instances for Upstash).
 *
 * Privacy: visitor keys (an IP on Vercel) are never stored as such. Memory: SHA-256 with a random per-process salt.
 * Upstash: HMAC-SHA256 keyed with the (secret) Upstash token, so the stored id can't be reversed by trying IPs; the keys
 * expire after at most two windows.
 */

export interface RateRule {
  limit: number;
  windowMs: number;
}

export interface RateDecision {
  allowed: boolean;
  /** seconds until the request may be retried (0 when allowed) */
  retryAfterSeconds: number;
  /** why it was refused: a visitor limit, the server-wide limit, or the shared store is unavailable (fail closed) */
  scope?: "client" | "global" | "unavailable";
}

export interface RateLimiter {
  /** true only for a limiter whose counters are shared by every server instance */
  readonly distributed: boolean;
  take(clientKey: string, now?: number): Promise<RateDecision>;
}

/** Default limits: per visitor 6 a minute and 40 an hour; server-wide 60 a minute (cost guard). */
export const DEFAULT_CLIENT_RULES: RateRule[] = [{ limit: 6, windowMs: 60_000 }, { limit: 40, windowMs: 3_600_000 }];
export const DEFAULT_GLOBAL_RULES: RateRule[] = [{ limit: 60, windowMs: 60_000 }];

// ---------------------------------------------------------------- in-memory (per instance)

interface Window {
  start: number;
  count: number;
}

export class MemoryRateLimiter implements RateLimiter {
  readonly distributed = false;
  private readonly clientRules: RateRule[];
  private readonly globalRules: RateRule[];
  private readonly maxKeys: number;
  private readonly salt = randomBytes(16).toString("hex");
  private readonly windows = new Map<string, Window[]>();
  private readonly global: Window[];

  constructor(options: { client?: RateRule[]; global?: RateRule[]; maxKeys?: number } = {}) {
    this.clientRules = options.client ?? DEFAULT_CLIENT_RULES;
    this.globalRules = options.global ?? DEFAULT_GLOBAL_RULES;
    this.maxKeys = options.maxKeys ?? 10_000;
    this.global = this.globalRules.map(() => ({ start: 0, count: 0 }));
  }

  private hash(key: string): string {
    return createHash("sha256").update(this.salt + key).digest("hex").slice(0, 32);
  }

  private static check(rules: RateRule[], windows: Window[], now: number): number {
    let retry = 0;
    rules.forEach((rule, i) => {
      const w = windows[i];
      if (now - w.start >= rule.windowMs) { w.start = now; w.count = 0; }
      if (w.count >= rule.limit) retry = Math.max(retry, Math.ceil((w.start + rule.windowMs - now) / 1000));
    });
    return retry;
  }

  private prune(now: number) {
    const longest = Math.max(...this.clientRules.map((r) => r.windowMs));
    for (const [k, ws] of this.windows) if (ws.every((w) => now - w.start >= longest)) this.windows.delete(k);
    // still too many distinct clients: drop the oldest entries (Map keeps insertion order)
    while (this.windows.size >= this.maxKeys) this.windows.delete(this.windows.keys().next().value as string);
  }

  async take(clientKey: string, now: number = Date.now()): Promise<RateDecision> {
    const key = this.hash(clientKey);
    let ws = this.windows.get(key);
    if (!ws) {
      if (this.windows.size >= this.maxKeys) this.prune(now);
      ws = this.clientRules.map(() => ({ start: now, count: 0 }));
      this.windows.set(key, ws);
    }
    const clientRetry = MemoryRateLimiter.check(this.clientRules, ws, now);
    if (clientRetry) return { allowed: false, retryAfterSeconds: clientRetry, scope: "client" };
    const globalRetry = MemoryRateLimiter.check(this.globalRules, this.global, now);
    if (globalRetry) return { allowed: false, retryAfterSeconds: globalRetry, scope: "global" };
    for (const w of ws) w.count++;
    for (const w of this.global) w.count++;
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

// ---------------------------------------------------------------- Upstash Redis (distributed)

/** Seconds a visitor is asked to wait when the shared store is unavailable. */
export const UNAVAILABLE_RETRY_SECONDS = 30;
export const UPSTASH_TIMEOUT_MS = 1_500;

export interface UpstashOptions {
  url: string;
  token: string;
  client?: RateRule[];
  global?: RateRule[];
  timeoutMs?: number;
  prefix?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Fixed-window counters in Upstash Redis over its REST API (no client library): one key per rule and window
 * ("<prefix>:c:<visitor id>:<window ms>:<window number>"), incremented and given an expiry of two windows inside one
 * MULTI/EXEC transaction (POST <url>/multi-exec). A key per window means no expiry race: a counter can never outlive
 * its window or block a visitor indefinitely.
 *
 * Visitor limits are checked first; the server-wide counter is only incremented for requests that pass them, so one
 * visitor hammering the endpoint can't use up the shared budget. A refused visitor request still counts in that
 * visitor's own windows.
 */
export class UpstashRateLimiter implements RateLimiter {
  readonly distributed = true;
  private readonly endpoint: string;
  private readonly token: string;
  private readonly clientRules: RateRule[];
  private readonly globalRules: RateRule[];
  private readonly timeoutMs: number;
  private readonly prefix: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: UpstashOptions) {
    this.endpoint = `${options.url.replace(/\/+$/, "")}/multi-exec`;
    this.token = options.token;
    this.clientRules = options.client ?? DEFAULT_CLIENT_RULES;
    this.globalRules = options.global ?? DEFAULT_GLOBAL_RULES;
    this.timeoutMs = options.timeoutMs ?? UPSTASH_TIMEOUT_MS;
    this.prefix = options.prefix ?? "sophia-bot:rl:v1";
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private visitorId(clientKey: string): string {
    return createHmac("sha256", this.token).update(clientKey).digest("hex").slice(0, 32);
  }

  /** Runs INCR + PEXPIRE for each key in one transaction; returns the counts, or null on any failure. */
  private async increment(keys: { key: string; ttlMs: number }[]): Promise<number[] | null> {
    const commands = keys.flatMap(({ key, ttlMs }) => [["INCR", key], ["PEXPIRE", key, String(ttlMs)]]);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(commands),
        signal: controller.signal,
        cache: "no-store",
      });
      if (!res.ok) {
        console.error(`[bot] rate limit store failed: HTTP ${res.status}`);
        return null;
      }
      const data = (await res.json()) as unknown;
      // a discarded transaction is a single {"error": …}; otherwise one {"result": …} or {"error": …} per command
      if (!Array.isArray(data) || data.length !== commands.length) {
        console.error("[bot] rate limit store failed: unexpected response");
        return null;
      }
      const counts: number[] = [];
      for (let i = 0; i < data.length; i += 2) {
        const incr = data[i] as { result?: unknown; error?: unknown } | null;
        const expire = data[i + 1] as { result?: unknown; error?: unknown } | null;
        if (!incr || typeof incr.result !== "number" || !Number.isFinite(incr.result) || incr.result < 1 || !expire || expire.error !== undefined) {
          console.error("[bot] rate limit store failed: command error");
          return null;
        }
        counts.push(incr.result);
      }
      return counts;
    } catch (e) {
      console.error(`[bot] rate limit store failed: ${(e as { name?: string })?.name === "AbortError" ? "timeout" : "network error"}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private static over(rules: RateRule[], counts: number[], now: number): number {
    let retry = 0;
    rules.forEach((rule, i) => {
      if (counts[i] > rule.limit) {
        const windowEnd = (Math.floor(now / rule.windowMs) + 1) * rule.windowMs;
        retry = Math.max(retry, Math.max(1, Math.ceil((windowEnd - now) / 1000)));
      }
    });
    return retry;
  }

  async take(clientKey: string, now: number = Date.now()): Promise<RateDecision> {
    const unavailable: RateDecision = { allowed: false, retryAfterSeconds: UNAVAILABLE_RETRY_SECONDS, scope: "unavailable" };
    const id = this.visitorId(clientKey);
    const keyOf = (scope: string, rule: RateRule) => ({ key: `${this.prefix}:${scope}:${rule.windowMs}:${Math.floor(now / rule.windowMs)}`, ttlMs: rule.windowMs * 2 });

    const visitor = await this.increment(this.clientRules.map((r) => keyOf(`c:${id}`, r)));
    if (!visitor) return unavailable;
    const visitorRetry = UpstashRateLimiter.over(this.clientRules, visitor, now);
    if (visitorRetry) return { allowed: false, retryAfterSeconds: visitorRetry, scope: "client" };

    const global = await this.increment(this.globalRules.map((r) => keyOf("g", r)));
    if (!global) return unavailable;
    const globalRetry = UpstashRateLimiter.over(this.globalRules, global, now);
    if (globalRetry) return { allowed: false, retryAfterSeconds: globalRetry, scope: "global" };
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

// ---------------------------------------------------------------- configuration

type Env = Record<string, string | undefined>;

export type RateLimitSetup =
  | { kind: "upstash"; url: string; token: string }
  | { kind: "memory" }
  | { kind: "invalid"; problem: string };

/**
 * Upstash REST URLs are https://<database>.upstash.io (from the Upstash console, REST tab). Only that host is accepted,
 * so a mistyped value can never send the token anywhere else.
 */
const UPSTASH_URL = /^https:\/\/[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9-]+)*\.upstash\.io\/?$/i;

/**
 * Which limiter the environment selects (server-only variables):
 *   both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN valid → upstash (distributed)
 *   neither set                                                    → memory (per instance; not allowed on production)
 *   only one set, or a malformed value                             → invalid (the bot stays off; fail closed)
 * Problems name the variable, never its value.
 */
export function rateLimitSetup(env: Env = process.env): RateLimitSetup {
  const url = env.UPSTASH_REDIS_REST_URL?.trim() ?? "";
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim() ?? "";
  if (!url && !token) return { kind: "memory" };
  if (!url || !token) return { kind: "invalid", problem: "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must both be set" };
  if (!UPSTASH_URL.test(url)) return { kind: "invalid", problem: "UPSTASH_REDIS_REST_URL must be the https://….upstash.io REST URL" };
  if (!/^[A-Za-z0-9_=+/-]{20,}$/.test(token)) return { kind: "invalid", problem: "UPSTASH_REDIS_REST_TOKEN is malformed" };
  return { kind: "upstash", url: url.replace(/\/+$/, ""), token };
}

/** "shared" | "memory" | "invalid", for the availability check in config.ts. */
export function rateLimitMode(env: Env = process.env): "shared" | "memory" | "invalid" {
  const setup = rateLimitSetup(env);
  return setup.kind === "upstash" ? "shared" : setup.kind;
}

let cached: { signature: string; limiter: RateLimiter } | null = null;

/** The process-wide limiter for the current environment, or null when the configuration is invalid. */
export function botRateLimiter(env: Env = process.env): RateLimiter | null {
  const setup = rateLimitSetup(env);
  if (setup.kind === "invalid") return null;
  const signature = setup.kind === "upstash" ? `upstash:${setup.url}:${createHash("sha256").update(setup.token).digest("hex")}` : "memory";
  if (cached?.signature !== signature) {
    cached = { signature, limiter: setup.kind === "upstash" ? new UpstashRateLimiter({ url: setup.url, token: setup.token }) : new MemoryRateLimiter() };
  }
  return cached.limiter;
}

/** Drops the process-wide limiter (tests). */
export function resetBotRateLimiter() {
  cached = null;
}

/**
 * The client a request counts against. On Vercel the platform sets x-real-ip itself (a client can't forge it there);
 * anywhere else forwarded headers are not trusted and every request shares one "local" bucket (the global cap still
 * applies).
 */
export function clientKeyOf(request: Request, env: Env = process.env): string {
  if (env.VERCEL === "1") {
    const ip = request.headers.get("x-real-ip")?.trim();
    if (ip) return `ip:${ip}`;
  }
  return "local";
}
