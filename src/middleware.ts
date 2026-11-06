import { NextResponse, type NextRequest } from "next/server";
import { parseSession, SESSION_COOKIE } from "@/lib/demoAuth";
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

// Event and member IDs are lowercase slugs. On a case-insensitive filesystem (Windows), the
// production server answered the first request for a wrong-case ID (e.g. /team/OM-BHOYAR)
// with the prerendered page and later requests with a 404. Rewrite any uppercase ID to an
// unknown lowercase ID in the same section, so the page's notFound() returns a consistent 404.
const DETAIL_WITH_UPPERCASE = /^\/(events|team)\/[^/]*[A-Z][^/]*\/?$/;

const toLogin = (request: NextRequest, pathname: string) => {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
};

// CMS_AUTH_MODE=supabase (fixed at build time, D2): the demo cookie is ignored entirely. Admin pages need a verified
// admin session (getUser + 8-hour deadline + profiles.role = 'admin'); the session is refreshed here, and every
// cookie is re-written httpOnly/Secure/SameSite=Lax to expire at the original deadline. Cookie-carrying requests to
// /api/admin and /api/auth/session get the same check, so the route handlers always see a fresh token.
async function supabaseGate(request: NextRequest, pathname: string): Promise<NextResponse> {
  const adminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  const hasSessionCookie = request.cookies.getAll().some((c) => isSupabaseCookie(c.name));
  // API calls without a session cookie (anonymous or Bearer) are answered by the route's own requireAdmin()
  if (!adminPage && (!hasSessionCookie || request.headers.has("authorization"))) return NextResponse.next();
  if (!adminPage && !pathname.startsWith("/api/")) return NextResponse.next();

  const config = publicSupabaseConfig();
  if (!config) return adminPage ? toLogin(request, pathname) : NextResponse.next();

  const pending: PendingCookie[] = [];
  const result = await readAdminSession(createSessionClient(config, request.cookies, pending));
  if (!result.ok) {
    const headers = { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
    // /api/auth/session: "signed out" is a normal answer (200, data null); /api/admin stays 401
    const denied = adminPage
      ? toLogin(request, pathname)
      : pathname === "/api/auth/session"
        ? NextResponse.json({ data: null }, { status: 200, headers })
        : NextResponse.json({ error: "Sign in required." }, { status: 401, headers });
    for (const cookie of request.cookies.getAll()) if (isSupabaseCookie(cookie.name)) denied.cookies.set(cookie.name, "", REMOVED_COOKIE);
    return denied;
  }
  for (const cookie of pending) request.cookies.set(cookie.name, cookie.value);
  const response = NextResponse.next({ request });
  for (const cookie of pending) response.cookies.set(cookie.name, cookie.value, enforcedCookieOptions(cookie.options, result.deadline));
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const uppercaseDetail = pathname.match(DETAIL_WITH_UPPERCASE);
  if (uppercaseDetail) {
    return NextResponse.rewrite(new URL(`/${uppercaseDetail[1]}/__not-found`, request.url));
  }

  if (cmsAuthMode() === "supabase") return supabaseGate(request, pathname);

  // Redirects signed-out visitors away from the mock admin area.
  // The demo cookie is forgeable; this is a UX guard, not access control.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const session = parseSession(request.cookies.get(SESSION_COOKIE)?.value);
    if (session) return NextResponse.next();

    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // /api/admin and /api/auth/session only matter in Supabase mode; in demo mode they pass straight through
  matcher: ["/admin", "/admin/:path*", "/events/:id", "/team/:id", "/api/admin/:path*", "/api/auth/session"],
};
