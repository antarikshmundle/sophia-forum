import { rateLimitMode } from "./ratelimit";

/**
 * SOPHIA BOT server configuration (server-only environment variables; none is ever NEXT_PUBLIC_ or sent to the browser).
 *
 *   SOPHIA_BOT_ENABLED   "true" turns the bot on. Anything else (including unset) = off: no launcher, /api/bot/chat is 404.
 *   GEMINI_API_KEY       Gemini API key (Google AI Studio / Cloud project with billing). Missing = bot off.
 *   GEMINI_MODEL         Gemini model ID, e.g. a current Flash-Lite model. Required: no built-in default, so the model
 *                        (and its price) is always a deliberate choice. Missing or malformed = bot off.
 *
 *   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
 *                        Upstash Redis REST credentials for the shared (distributed) rate limiter (ratelimit.ts).
 *
 * Fail closed:
 *  - only one Upstash variable set, or a malformed one → bot off everywhere ("rate-limit-misconfigured");
 *  - a Vercel production deployment without valid Upstash credentials → bot off ("shared-rate-limit-required"): public
 *    production traffic is never protected by the per-instance in-memory limiter alone;
 *  - at request time, an unreachable Upstash refuses the request (503) instead of falling back to memory.
 * Local runs and preview deployments without Upstash use the in-memory limiter.
 */

export type BotUnavailableReason = "flag-off" | "missing-api-key" | "missing-model" | "rate-limit-misconfigured" | "shared-rate-limit-required";

export type BotAvailability =
  | { enabled: true; apiKey: string; model: string }
  | { enabled: false; reason: BotUnavailableReason };

type Env = Record<string, string | undefined>;

// model IDs are path segments of the API URL: letters, digits, dots and hyphens only
const MODEL_ID = /^[a-z0-9][a-z0-9.-]{1,79}$/;

/** Whether the bot may run, given the environment (and the rate limiter it selects). */
export function botAvailability(env: Env = process.env, rateLimit: "shared" | "memory" | "invalid" = rateLimitMode(env)): BotAvailability {
  if (env.SOPHIA_BOT_ENABLED !== "true") return { enabled: false, reason: "flag-off" };
  const apiKey = env.GEMINI_API_KEY?.trim() ?? "";
  if (!apiKey) return { enabled: false, reason: "missing-api-key" };
  const model = env.GEMINI_MODEL?.trim() ?? "";
  if (!MODEL_ID.test(model)) return { enabled: false, reason: "missing-model" };
  if (rateLimit === "invalid") return { enabled: false, reason: "rate-limit-misconfigured" };
  if (env.VERCEL_ENV === "production" && rateLimit !== "shared") return { enabled: false, reason: "shared-rate-limit-required" };
  return { enabled: true, apiKey, model };
}

/** Limits of one chat request. */
export const CHAT_LIMITS = {
  /** characters in the question */
  maxMessageChars: 500,
  /** previous messages sent as context (user and assistant messages each count as one turn) */
  maxHistoryTurns: 6,
  /** characters per previous message */
  maxHistoryChars: 1000,
  /** retrieved passages given to the model */
  maxSources: 6,
  /** characters in an answer */
  maxAnswerChars: 2000,
  /** Gemini request timeout */
  timeoutMs: 20_000,
} as const;
