import { crossSiteReason, json, NO_STORE_HEADERS } from "@/lib/cms/auth";
import { readJsonBody } from "@/lib/cms/validation";
import { botAvailability } from "@/lib/bot/config";
import { botRateLimiter, clientKeyOf } from "@/lib/bot/ratelimit";
import { answerChat, parseChatRequest, type ChatDeps } from "@/lib/bot/chat";
import { retrieveForQuestion } from "@/lib/bot/sources";
import { generateWithGemini } from "@/lib/bot/gemini";

/**
 * POST /api/bot/chat — one SOPHIA BOT question.
 *   404  the bot is off (SOPHIA_BOT_ENABLED not "true", Gemini key or model missing, Upstash misconfigured, or a
 *        production deployment without the shared Upstash rate limiter): the route doesn't exist for visitors
 *   403  not a same-origin browser request
 *   400/413/415  invalid body (JSON object { message, history? }, at most 32 KB)
 *   429  rate limited (Retry-After header)
 *   503  the shared rate-limit store is unavailable: refused (fail closed), never let through unlimited
 *   200  { answer, sources, fallback, language }: a grounded answer, or a fixed fallback reply
 * No conversation is stored or logged.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deps: ChatDeps = { retrieve: retrieveForQuestion, generate: (req) => generateWithGemini(req) };

let warned = "";
/** Tells the operator once (per instance and reason) why an enabled bot is off: reason names only, never values. */
function warnUnavailable(reason: string) {
  if (process.env.SOPHIA_BOT_ENABLED !== "true" || warned === reason) return;
  warned = reason;
  console.warn(`[bot] SOPHIA_BOT_ENABLED is true but the bot is off: ${reason}`);
}

function refuse(status: 429 | 503, error: string, retryAfterSeconds: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...NO_STORE_HEADERS, "Content-Type": "application/json; charset=utf-8", "Retry-After": String(retryAfterSeconds) },
  });
}

export async function POST(request: Request): Promise<Response> {
  const availability = botAvailability();
  const limiter = botRateLimiter();
  if (!availability.enabled || !limiter) {
    warnUnavailable(availability.enabled ? "rate-limit-misconfigured" : availability.reason);
    return json({ error: "Not found." }, 404);
  }
  if (crossSiteReason(request, false)) return json({ error: "Request rejected." }, 403);

  const body = await readJsonBody(request);
  if (!body.ok) return json({ error: body.error }, body.status);
  const parsed = parseChatRequest(body.body);
  if (!parsed.ok) return json({ error: "Please check your question.", errors: parsed.errors }, 400);

  const decision = await limiter.take(clientKeyOf(request));
  if (!decision.allowed) {
    return decision.scope === "unavailable"
      ? refuse(503, "Sophia Bot is temporarily unavailable. Please try again shortly.", decision.retryAfterSeconds)
      : refuse(429, "Too many questions. Please wait a moment and try again.", decision.retryAfterSeconds);
  }

  return json(await answerChat(parsed.value, availability, deps));
}
