import { cookies } from "next/headers";
import { crossSiteReason, json } from "@/lib/cms/auth";
import { cmsAuthMode } from "@/lib/cms/mode";
import { createSessionClient, isSupabaseCookie, publicSupabaseConfig, REMOVED_COOKIE, type PendingCookie } from "@/lib/cms/session";

// Admin sign-out (CMS_AUTH_MODE=supabase only): revokes this session in Supabase (its refresh token can't be reused)
// and removes every Supabase cookie. Idempotent: signing out without a session also succeeds.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (cmsAuthMode() !== "supabase") return json({ error: "Not found." }, 404);
  if (crossSiteReason(request, false)) return json({ error: "Request rejected." }, 403);
  const store = await cookies();
  const config = publicSupabaseConfig();
  if (config) {
    const pending: PendingCookie[] = [];
    await createSessionClient(config, store, pending).auth.signOut({ scope: "local" }).catch(() => {});
  }
  for (const cookie of store.getAll()) if (isSupabaseCookie(cookie.name)) store.set(cookie.name, "", REMOVED_COOKIE);
  return json({ data: null }, 200);
}
