import { cookies } from "next/headers";
import { crossSiteReason, json, NO_STORE_HEADERS } from "@/lib/cms/auth";
import { cmsAuthMode } from "@/lib/cms/mode";
import {
  createSessionClient,
  enforcedCookieOptions,
  GENERIC_LOGIN_ERROR,
  passwordSignIn,
  publicSupabaseConfig,
  REMOVED_COOKIE,
  type PendingCookie,
} from "@/lib/cms/session";
import { readJsonBody } from "@/lib/cms/validation";

// Admin sign-in (CMS_AUTH_MODE=supabase only). Same-origin, rate-limited, admin-only; tokens never reach the browser.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// D5: 5 attempts per minute per email address. Keyed by email, not IP: route handlers have no trusted client IP,
// and client-supplied X-Forwarded-For is never trusted. A global cap limits guessing across many addresses.
// In memory (accepted for launch, 2026-11-05): on Vercel each serverless instance keeps its own counters and a cold
// start resets them, so this is a per-instance limit, not a global one. Supabase Auth's own sign-in rate limits still
// apply on every attempt. A shared store (e.g. Redis/KV) is the upgrade path if a global limit is needed.
const WINDOW_MS = 60_000;
const PER_EMAIL = 5;
const GLOBAL = 60;
const attempts = new Map<string, number[]>();
let globalAttempts: number[] = [];

function rateLimited(email: string, now: number): boolean {
  globalAttempts = globalAttempts.filter((t) => now - t < WINDOW_MS);
  const recent = (attempts.get(email) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= PER_EMAIL || globalAttempts.length >= GLOBAL) {
    attempts.set(email, recent);
    return true;
  }
  recent.push(now);
  globalAttempts.push(now);
  attempts.set(email, recent);
  if (attempts.size > 1000) for (const [key, times] of attempts) if (!times.some((t) => now - t < WINDOW_MS)) attempts.delete(key);
  return false;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  if (cmsAuthMode() !== "supabase") return json({ error: "Not found." }, 404);
  if (crossSiteReason(request, false)) return json({ error: "Request rejected." }, 403);
  const config = publicSupabaseConfig();
  if (!config) return json({ error: "Sign-in is not configured." }, 503);

  const body = await readJsonBody(request);
  if (!body.ok) return json({ error: body.error }, body.status);
  const email = typeof body.body.email === "string" ? body.body.email.trim().toLowerCase() : "";
  const password = typeof body.body.password === "string" ? body.body.password : "";
  if (!EMAIL.test(email) || email.length > 320 || !password || password.length > 256) return json({ error: GENERIC_LOGIN_ERROR }, 401);

  if (rateLimited(email, Date.now())) {
    return new Response(JSON.stringify({ error: "Too many sign-in attempts. Try again in a minute." }), {
      status: 429,
      headers: { ...NO_STORE_HEADERS, "Content-Type": "application/json; charset=utf-8", "Retry-After": "60" },
    });
  }

  const store = await cookies();
  const pending: PendingCookie[] = [];
  const result = await passwordSignIn(createSessionClient(config, store, pending), email, password);
  if (!result.ok) {
    // wrong credentials, a non-admin account or a missing sign-in time: identical answer, no session cookie kept
    for (const cookie of pending) store.set(cookie.name, "", REMOVED_COOKIE);
    return json({ error: GENERIC_LOGIN_ERROR }, 401);
  }
  for (const cookie of pending) store.set(cookie.name, cookie.value, enforcedCookieOptions(cookie.options, result.deadline));
  return json({ data: result.session }, 200);
}
