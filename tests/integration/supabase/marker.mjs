// Marker verification: proves (1) the configured Supabase project and (2) the running app server both point at the
// disposable test project. Read-only apart from one admin sign-in / sign-out on the test project.
import { createClient } from "@supabase/supabase-js";
import { MARKER } from "./allowlist.mjs";

const isMarker = (data, ref) => !!data && typeof data === "object" && data.project === MARKER.project && data.ref === ref;

/** Reads the marker row with the public key (no session). */
export async function checkPublicMarker(env) {
  const client = createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const r = await client.from("site_content").select("id, data").eq("id", MARKER.id).maybeSingle();
  if (r.error) throw new Error(`REFUSED: could not read the marker row (${r.error.code ?? "network error"}). Is the test project set up and awake?`);
  if (!r.data) throw new Error(`REFUSED: the marker row ${MARKER.id} is missing. Run setup-test-project.sql in the TEST project only.`);
  if (!isMarker(r.data.data, env.ref)) throw new Error(`REFUSED: the marker row ${MARKER.id} does not name this test project.`);
}

// ---------------------------------------------------------------- minimal cookie session against the app

/** Session cookies from Set-Cookie headers (name=value only); removals (empty value / Max-Age=0) drop the cookie. */
export function applySetCookies(jar, response) {
  const flags = [];
  for (const line of response.headers.getSetCookie()) {
    const [pair, ...attrs] = line.split(";").map((s) => s.trim());
    const eq = pair.indexOf("=");
    const name = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    const removed = !value || attrs.some((a) => /^max-age=0$/i.test(a));
    if (removed) jar.delete(name); else jar.set(name, value);
    flags.push({ name, httpOnly: attrs.some((a) => /^httponly$/i.test(a)), secure: attrs.some((a) => /^secure$/i.test(a)), sameSite: attrs.find((a) => /^samesite=/i.test(a))?.split("=")[1]?.toLowerCase(), removed });
  }
  return flags;
}
export const cookieHeader = (jar) => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

/**
 * Signs in to the app as the test admin, checks the cookie flags, reads the marker through /api/admin/content,
 * signs out and confirms the old cookies no longer work. Returns a list of passed check names.
 */
export async function checkAppMarker(baseUrl, env) {
  const passed = [];
  const expect = (ok, name) => { if (!ok) throw new Error(`CHECK FAILED: ${name}`); passed.push(name); };
  const origin = new URL(baseUrl).origin;

  expect((await fetch(`${baseUrl}/api/auth/session`)).status === 401, "signed out: /api/auth/session → 401 (server is in Supabase auth mode)");
  expect((await fetch(`${baseUrl}/api/admin/content`)).status === 401, "signed out: GET /api/admin/content → 401");

  const jar = new Map();
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ email: env.users.admin.email, password: env.users.admin.password }),
  });
  const flags = applySetCookies(jar, login);
  const body = await login.json().catch(() => null);
  expect(login.status === 200, "admin sign-in through the app → 200");
  expect(!JSON.stringify(body ?? {}).match(/access_token|refresh_token|eyJ/), "sign-in response carries no tokens");
  const set = flags.filter((f) => !f.removed);
  expect(set.length > 0 && set.every((f) => f.httpOnly && f.secure && f.sameSite === "lax"), "session cookies are HttpOnly, Secure, SameSite=Lax");

  const content = await fetch(`${baseUrl}/api/admin/content`, { headers: { Cookie: cookieHeader(jar) } });
  const data = (await content.json().catch(() => null))?.data;
  expect(content.status === 200, "admin GET /api/admin/content → 200");
  expect(isMarker(data?.[MARKER.id], env.ref), "the app server reads the test project's marker row");

  const oldCookies = cookieHeader(jar);
  const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: "POST", headers: { Cookie: oldCookies, Origin: origin } });
  applySetCookies(jar, logout);
  expect(logout.status === 200 && jar.size === 0, "sign-out → 200 and every session cookie removed");
  expect((await fetch(`${baseUrl}/api/admin/content`, { headers: { Cookie: oldCookies } })).status === 401, "the signed-out session's cookies no longer work → 401");
  return passed;
}
