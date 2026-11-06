import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase admin sign-in sessions (CMS_AUTH_MODE=supabase). Edge-compatible: used by the middleware as well as the
 * /api/auth route handlers, so it avoids Node-only APIs (no Buffer, no next/headers).
 *
 * - Cookies are always written httpOnly, Secure, SameSite=Lax, path "/": browser JavaScript never sees a token.
 * - Absolute 8-hour session (D6): the deadline is the sign-in time recorded by Supabase in the access token's
 *   signed `amr` claim plus 8 hours. Token refreshes keep that sign-in time, every cookie is written to expire at
 *   the deadline, and a session past it is signed out on the server. A refresh never extends it.
 * - Admin = a verified user (getUser) whose public.profiles row has role 'admin'.
 */

export const SESSION_MAX_SECONDS = 8 * 60 * 60;
export const GENERIC_LOGIN_ERROR = "Email or password is incorrect.";

export interface AdminSession {
  email: string;
  name: string;
  role: "admin";
}

export interface PendingCookie {
  name: string;
  value: string;
  options: CookieOptions;
}

interface CookieSource {
  getAll(): { name: string; value: string }[];
}

export interface PublicSupabaseConfig {
  url: string;
  publicKey: string;
}

function decodeBase64Url(part: string): string {
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
  return new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
}

function jwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = JSON.parse(decodeBase64Url(token.split(".")[1] ?? "")) as unknown;
    return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The project URL and PUBLIC key, or null when missing or when the key is a secret/service-role key. */
export function publicSupabaseConfig(): PublicSupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url)) return null;
  if (key.startsWith("sb_secret_")) return null;
  if (key.startsWith("eyJ") && jwtPayload(key)?.role !== "anon") return null;
  return { url: url.replace(/\/$/, ""), publicKey: key };
}

/** Sign-in time (seconds) from the access token's `amr` claim; null when absent (→ treated as expired). */
export function signInTime(accessToken: string): number | null {
  const amr = jwtPayload(accessToken)?.amr;
  if (!Array.isArray(amr)) return null;
  const times = amr
    .map((entry) => (entry && typeof entry === "object" ? (entry as { timestamp?: unknown }).timestamp : undefined))
    .filter((t): t is number => typeof t === "number" && Number.isFinite(t));
  return times.length ? Math.min(...times) : null;
}

export function sessionDeadline(accessToken: string): number | null {
  const started = signInTime(accessToken);
  return started === null ? null : started + SESSION_MAX_SECONDS;
}

export const nowSeconds = () => Math.floor(Date.now() / 1000);

/** The only options any Supabase session cookie is ever written with. Removals stay removals. */
export function enforcedCookieOptions(options: CookieOptions, deadline: number | null, now = nowSeconds()): CookieOptions {
  const removal = options.maxAge === 0 || (options.expires instanceof Date && options.expires.getTime() <= Date.now());
  const remaining = deadline === null ? 0 : Math.max(0, deadline - now);
  return { path: "/", sameSite: "lax", secure: true, httpOnly: true, maxAge: removal ? 0 : remaining };
}

export const REMOVED_COOKIE: CookieOptions = { path: "/", sameSite: "lax", secure: true, httpOnly: true, maxAge: 0 };

export const isSupabaseCookie = (name: string) => name.startsWith("sb-");

/**
 * A Supabase client that reads the request's cookies and collects every cookie it wants to write into `pending`.
 * The caller writes them afterwards with enforcedCookieOptions, once the session deadline is known.
 */
export function createSessionClient(config: PublicSupabaseConfig, source: CookieSource, pending: PendingCookie[]): SupabaseClient {
  return createServerClient(config.url, config.publicKey, {
    cookies: {
      getAll: () => source.getAll(),
      setAll: (list) => {
        for (const cookie of list) pending.push(cookie);
      },
    },
  });
}

async function adminProfile(client: SupabaseClient, userId: string): Promise<{ name: string } | null> {
  const profile = await client.from("profiles").select("role, display_name").eq("user_id", userId).maybeSingle();
  return !profile.error && profile.data?.role === "admin" ? { name: String(profile.data.display_name) } : null;
}

export type SessionCheck =
  | { ok: true; session: AdminSession; deadline: number }
  | { ok: false; reason: "no-session" | "expired" | "not-admin" };

/** Verifies the cookie session with Supabase (refreshing it when needed), the 8-hour deadline and the admin role. */
export async function readAdminSession(client: SupabaseClient, now = nowSeconds()): Promise<SessionCheck> {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return { ok: false, reason: "no-session" };
  // getUser has just verified (and if needed refreshed) the stored session; its access token carries the sign-in time
  const { data: stored } = await client.auth.getSession();
  const deadline = stored.session ? sessionDeadline(stored.session.access_token) : null;
  if (deadline === null || now >= deadline) {
    await client.auth.signOut({ scope: "local" }).catch(() => {});
    return { ok: false, reason: "expired" };
  }
  const profile = await adminProfile(client, data.user.id);
  if (!profile) return { ok: false, reason: "not-admin" };
  return { ok: true, session: { email: data.user.email ?? "", name: profile.name, role: "admin" }, deadline };
}

export type SignInResult = { ok: true; session: AdminSession; deadline: number } | { ok: false };

/** Email + password sign-in that only succeeds for admins; any other outcome leaves no session behind. */
export async function passwordSignIn(client: SupabaseClient, email: string, password: string, now = nowSeconds()): Promise<SignInResult> {
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session || !signedIn.data.user) return { ok: false };
  const deadline = sessionDeadline(signedIn.data.session.access_token);
  const profile = await adminProfile(client, signedIn.data.user.id);
  if (deadline === null || now >= deadline || !profile) {
    await client.auth.signOut({ scope: "local" }).catch(() => {});
    return { ok: false };
  }
  return { ok: true, session: { email: signedIn.data.user.email ?? email, name: profile.name, role: "admin" }, deadline };
}
