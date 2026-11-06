import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { enforcedCookieOptions, sessionDeadline } from "./session";

/**
 * Server-side Supabase clients for the CMS API. They always use the project's PUBLIC (publishable/anon) key and
 * act as the signed-in user, so Row Level Security applies to every query. No secret or service-role key is
 * ever read here.
 */

export interface SupabaseConfig {
  url: string;
  publicKey: string;
}

/** The project URL and public key, or null when missing or when the key is not a public key. */
export function supabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url)) return null;
  if (key.startsWith("sb_secret_")) return null;
  if (key.startsWith("eyJ")) {
    try {
      const payload = JSON.parse(Buffer.from(key.split(".")[1] ?? "", "base64url").toString("utf8")) as { role?: string };
      if (payload.role !== "anon") return null;
    } catch {
      return null;
    }
  }
  return { url: url.replace(/\/$/, ""), publicKey: key };
}

const NO_PERSIST = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

/** Client for a request that sent `Authorization: Bearer <access token>` (API tests, future non-browser callers). */
export function createTokenClient(config: SupabaseConfig, accessToken: string): SupabaseClient {
  return createClient(config.url, config.publicKey, {
    auth: NO_PERSIST,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

type CookieWrite = { name: string; value: string; options: CookieOptions };

/** The 8-hour deadline of the session these cookies carry (from its access token's signed sign-in time), or null. */
function deadlineOfWrites(list: CookieWrite[]): number | null {
  // the session cookie may be split into chunks (sb-…-auth-token.0, .1, …); join them in order
  const parts = list
    .filter((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name) && c.value)
    .sort((a, b) => Number(a.name.split(".").pop()?.replace(/\D/g, "") || 0) - Number(b.name.split(".").pop()?.replace(/\D/g, "") || 0));
  const raw = parts.map((c) => c.value).join("");
  if (!raw.startsWith("base64-")) return null;
  try {
    const session = JSON.parse(Buffer.from(raw.slice("base64-".length), "base64url").toString("utf8")) as { access_token?: unknown };
    return typeof session.access_token === "string" ? sessionDeadline(session.access_token) : null;
  } catch {
    return null;
  }
}

/**
 * Applies Supabase's cookie writes with the enforced options only: httpOnly, Secure, SameSite=Lax, path "/", and a
 * lifetime that ends at the session's original 8-hour deadline (a refresh never extends it). Removals stay
 * removals; a session without a readable sign-in time, or past its deadline, is written with maxAge 0.
 */
export function enforcedCookieWrites(list: CookieWrite[]): CookieWrite[] {
  const deadline = deadlineOfWrites(list);
  return list.map(({ name, value, options }) => ({ name, value, options: enforcedCookieOptions(options, deadline) }));
}

/** Client for a browser request carrying the Supabase session cookies (sb-…); the demo cookie is never read. */
export async function createCookieClient(config: SupabaseConfig): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(config.url, config.publicKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of enforcedCookieWrites(list)) store.set(name, value, options);
        } catch {
          // Cookies are read-only in this context; the session refresh is picked up on the next request
        }
      },
    },
  });
}
