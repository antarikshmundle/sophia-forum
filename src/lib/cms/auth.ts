import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cmsFacultyMode } from "./mode";
import { createCookieClient, createTokenClient, supabaseConfig } from "./supabase-server";

/**
 * Guard for every /api/admin route:
 *  1. the CMS API exists only when CMS_FACULTY_MODE=backend (404 otherwise, so the default demo build exposes nothing);
 *  2. state-changing requests must be same-origin (or use a Bearer token, which browsers never attach on their own);
 *  3. the session is verified with Supabase Auth (getUser), never trusted from cookie content;
 *  4. the user must have the 'admin' role in public.profiles (RLS remains the second layer).
 * The demo cookie (sophia_demo_session) is never read and never grants access.
 */

export const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
} as const;

export function json(body: unknown, status = 200): Response {
  if (status === 204) return new Response(null, { status, headers: NO_STORE_HEADERS });
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...NO_STORE_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}

export interface AdminContext {
  client: SupabaseClient;
  user: User;
}

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const BEARER = /^Bearer\s+([A-Za-z0-9._~+/=-]+)$/;

/** Why a write request is refused as cross-site, or null when it may proceed. */
export function crossSiteReason(request: Request, usesBearerToken: boolean): string | null {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return "cross-site";
  const origin = request.headers.get("origin");
  if (origin) return origin === new URL(request.url).origin ? null : "origin mismatch";
  // No Origin header: only non-browser callers with an explicit token are accepted
  return usesBearerToken ? null : "missing origin";
}

export async function requireAdmin(request: Request): Promise<AdminContext | Response> {
  if (cmsFacultyMode() !== "backend") return json({ error: "Not found." }, 404);

  const authorization = request.headers.get("authorization");
  const token = authorization?.match(BEARER)?.[1] ?? null;
  if (authorization && !token) return json({ error: "Sign in required." }, 401);

  if (WRITE_METHODS.has(request.method) && crossSiteReason(request, token !== null)) {
    return json({ error: "Request rejected." }, 403);
  }

  const config = supabaseConfig();
  if (!config) return json({ error: "The CMS backend is not configured." }, 503);

  const client = token ? createTokenClient(config, token) : await createCookieClient(config);
  const { data, error } = token ? await client.auth.getUser(token) : await client.auth.getUser();
  if (error || !data.user) return json({ error: "Sign in required." }, 401);

  const profile = await client.from("profiles").select("role").eq("user_id", data.user.id).maybeSingle();
  if (profile.error || profile.data?.role !== "admin") return json({ error: "Admin access required." }, 403);

  return { client, user: data.user };
}
