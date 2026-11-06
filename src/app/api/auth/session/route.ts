import { cookies } from "next/headers";
import { json } from "@/lib/cms/auth";
import { cmsAuthMode } from "@/lib/cms/mode";
import {
  createSessionClient,
  enforcedCookieOptions,
  isSupabaseCookie,
  publicSupabaseConfig,
  readAdminSession,
  REMOVED_COOKIE,
  type PendingCookie,
} from "@/lib/cms/session";

// The signed-in admin ({ email, name, role }) or 401 (CMS_AUTH_MODE=supabase only). Never returns tokens.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (cmsAuthMode() !== "supabase") return json({ error: "Not found." }, 404);
  const config = publicSupabaseConfig();
  if (!config) return json({ error: "Sign-in is not configured." }, 503);
  const store = await cookies();
  const pending: PendingCookie[] = [];
  const result = await readAdminSession(createSessionClient(config, store, pending));
  if (!result.ok) {
    for (const cookie of store.getAll()) if (isSupabaseCookie(cookie.name)) store.set(cookie.name, "", REMOVED_COOKIE);
    return json({ error: "Sign in required." }, 401);
  }
  for (const cookie of pending) store.set(cookie.name, cookie.value, enforcedCookieOptions(cookie.options, result.deadline));
  return json({ data: result.session }, 200);
}
