// Sophia CMS P2.3 sign-in tests: sophia-cms-staging ONLY, against a LOCAL Next.js server.
//   node qa/cms-auth/cms-auth.test.mjs --mode supabase --base http://localhost:3010   (built + started with CMS_AUTH_MODE=supabase,
//                                                                                      started with CMS_FACULTY_MODE=backend)
//   node qa/cms-auth/cms-auth.test.mjs --mode demo     --base http://localhost:3000   (default build: demo sign-in unchanged)
// Credentials come from .env.test.local through qa/cms-db/lib/env.mjs (staging only; values never printed). The optional
// non-admin user (QA_NONADMIN_EMAIL / QA_NONADMIN_PASSWORD) is read from the same file; if it is missing, the non-admin
// checks FAIL (they are never skipped). Browser checks use a throw-away headless Chrome profile (qa/suites/lib/cdp.mjs).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { createClient } from "@supabase/supabase-js";
import { loadQaEnv, redact, STAGING_REF } from "../cms-db/lib/env.mjs";
import { launch, sleep } from "../suites/lib/cdp.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const MODE = arg("mode", "supabase");
const BASE = arg("base", MODE === "demo" ? "http://localhost:3000" : "http://localhost:3010").replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE)) { console.error("REFUSED: --base must be a local server."); process.exit(2); }
if (!["supabase", "demo"].includes(MODE)) { console.error("REFUSED: --mode must be supabase or demo."); process.exit(2); }

const env = loadQaEnv(ROOT);
const appRef = readFileSync(join(ROOT, ".env.local"), "utf8").match(/NEXT_PUBLIC_SUPABASE_URL\s*=\s*https:\/\/([a-z0-9]{20})\.supabase\.co/)?.[1];
if (appRef !== STAGING_REF) { console.error("REFUSED: the server's .env.local does not point at sophia-cms-staging."); process.exit(2); }
const extra = Object.fromEntries(readFileSync(join(ROOT, ".env.test.local"), "utf8").split(/\r?\n/).map((l) => l.match(/^\s*(QA_NONADMIN_(?:EMAIL|PASSWORD))\s*=\s*(.*?)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^(['"])(.*)\1$/, "$2")]));
const secrets = [env.key, env.adminPassword, env.adminEmail, extra.QA_NONADMIN_PASSWORD, extra.QA_NONADMIN_EMAIL].filter(Boolean);
const scrub = (s) => { let out = redact(String(s), env); for (const v of secrets) out = out.split(v).join("[redacted]"); return out; };

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok: !!ok, ...(ok || detail === undefined ? {} : { detail: scrub(JSON.stringify(detail)).slice(0, 300) }) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : "  — " + scrub(JSON.stringify(detail)).slice(0, 240)}`);
};
const section = (t) => console.log(`\n== ${t}`);
const GENERIC = "Email or password is incorrect.";
const D3_SHELL = "Faculty sign-in is live. Events, Gallery, Team, Users and Faculty data are still a local demo stored in this browser.";

// ---------------------------------------------------------------- HTTP helpers with a tiny cookie jar
let nonHttpOnlyCookies = 0, noStoreViolations = 0, apiResponses = 0;
function parseSetCookie(header) {
  const [pair, ...attrs] = header.split(";").map((s) => s.trim());
  const eq = pair.indexOf("=");
  const a = Object.fromEntries(attrs.map((x) => { const i = x.indexOf("="); return i < 0 ? [x.toLowerCase(), true] : [x.slice(0, i).toLowerCase(), x.slice(i + 1)]; }));
  return { name: pair.slice(0, eq), value: pair.slice(eq + 1), attrs: a };
}
async function http(method, path, { jar, origin = BASE, body, headers = {}, rawBody } = {}) {
  const h = { ...headers };
  if (origin) h.Origin = origin;
  if (jar && jar.size) h.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  let payload = rawBody;
  if (body !== undefined) { payload = JSON.stringify(body); h["Content-Type"] ??= "application/json"; }
  const r = await fetch(BASE + path, { method, headers: h, body: payload, redirect: "manual" });
  const set = (r.headers.getSetCookie?.() ?? []).map(parseSetCookie);
  for (const c of set) {
    if (c.name.startsWith("sb-") && !c.attrs.httponly) nonHttpOnlyCookies++;
    if (jar) { if (c.attrs["max-age"] === "0" || c.value === "") jar.delete(c.name); else jar.set(c.name, c.value); }
  }
  if (path.startsWith("/api/")) { apiResponses++; if (!/no-store/.test(r.headers.get("cache-control") ?? "")) noStoreViolations++; }
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text, set, location: r.headers.get("location") };
}
// the Supabase session cookie (possibly chunked .0/.1/…) → session object
const sessionFromJar = (jar) => {
  const names = [...jar.keys()].filter((n) => n.startsWith("sb-") && n.includes("-auth-token")).sort((a, b) => (a.split(".").pop() > b.split(".").pop() ? 1 : -1));
  const raw = names.map((n) => jar.get(n)).join("");
  if (!raw.startsWith("base64-")) return { names, session: null };
  try { return { names, session: JSON.parse(Buffer.from(raw.slice(7), "base64url").toString("utf8")) }; } catch { return { names, session: null }; }
};
const jarWithSession = (session, names) => {
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const jar = new Map();
  if (value.length <= 3180) jar.set(names.length === 1 ? names[0] : names[0].replace(/\.\d+$/, ""), value);
  else for (let i = 0; i * 3180 < value.length; i++) jar.set(`${names[0].replace(/\.\d+$/, "")}.${i}`, value.slice(i * 3180, (i + 1) * 3180));
  return jar;
};
const jwtClaims = (t) => { try { return JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString("utf8")); } catch { return null; } };

// ---------------------------------------------------------------- demo mode
if (MODE === "demo") {
  section("demo mode: Supabase sign-in is off, the demo flow is unchanged");
  for (const [m, p] of [["POST", "/api/auth/login"], ["POST", "/api/auth/logout"], ["GET", "/api/auth/session"]]) {
    const r = await http(m, p, { body: m === "POST" ? { email: env.adminEmail, password: env.adminPassword } : undefined });
    check(`DM1 ${m} ${p} → 404 in demo mode`, r.status === 404, r.status);
  }
  const page = await launch(9620);
  const authRequests = [];
  page.on("Network.requestWillBeSent", (p) => { if (/\/api\/auth\//.test(p.request.url)) authRequests.push(p.request.url); });
  try {
    await page.viewport("desktop");
    await page.goto(BASE + "/admin", 1500);
    check("DM2 /admin without a demo cookie → /login?next=%2Fadmin", (await page.ev("location.pathname + location.search")) === "/login?next=%2Fadmin");
    const ui = await page.ev(`({ title: document.title, notice: document.body.innerText.includes("Demo sign-in only."), creds: !!document.querySelector("fieldset legend") && document.querySelector("fieldset legend").innerText.toLowerCase().includes("demo credentials"), button: [...document.querySelectorAll('form button[type=submit]')].map(b => b.innerText.trim()) })`);
    check("DM3 login page unchanged: demo title, demo notice, demo credentials, SIGN IN TO DEMO", ui.title === "Demo Sign In | SOPHIA FORUM" && ui.notice && ui.creds && ui.button.includes("SIGN IN TO DEMO"), ui);
    const demoWording = await page.ev(`({ intro: document.querySelector('main h1')?.parentElement?.querySelector('p')?.innerText ?? "", placeholder: document.querySelector('main input[type=email]')?.placeholder })`);
    check("DM3b demo wording unchanged: 'Sign in to the local demo to open /admin.' and placeholder admin@demo.local", demoWording.intro === "Sign in to the local demo to open /admin." && demoWording.placeholder === "admin@demo.local", demoWording);
    await page.ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Fill in the admin demo credentials'); b.click(); return true; })()`);
    await sleep(200);
    await page.ev(`document.querySelector('form button[type=submit]').click(), true`);
    await sleep(2000);
    const after = await page.ev(`({ path: location.pathname, notice: document.body.innerText.includes("Demo admin — mock data only."), cookie: document.cookie.includes("sophia_demo_session=") })`);
    check("DM4 demo login via the form → /admin, demo notice, readable demo cookie (as before)", after.path === "/admin" && after.notice && after.cookie, after);
    await page.ev(`[...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'SIGN OUT').click(), true`);
    await sleep(1500);
    check("DM5 demo sign-out → back to /login, cookie gone", (await page.ev("location.pathname")) === "/login" && !(await page.ev(`document.cookie.includes("sophia_demo_session=")`)));
    await page.setCookie(`sb-${STAGING_REF}-auth-token`, "base64-eyJ4Ijoie30ifQ", BASE);
    await page.goto(BASE + "/admin", 1200);
    check("DM6 a Supabase cookie grants nothing in demo mode (/admin → login)", (await page.ev("location.pathname")) === "/login");
    check("DM7 demo pages never call /api/auth/*", authRequests.length === 0, authRequests);
    check("DM8 no console errors", page.errors.filter((e) => !/404/.test(e)).length === 0, page.errors);
  } finally { await page.close(); }
} else {
  // ---------------------------------------------------------------- offline: deadline and cookie rules on the real module
  section("offline: 8-hour deadline and cookie options (real src/lib/cms/session.ts)");
  {
    const req = createRequire(join(ROOT, "package.json"));
    const ts = req("typescript");
    const dir = join(tmpdir(), `cms-session-${Date.now()}`); mkdirSync(dir, { recursive: true });
    const js = ts.transpileModule(readFileSync(join(ROOT, "src/lib/cms/session.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
      .replace('from "@supabase/ssr"', `from ${JSON.stringify(pathToFileURL(req.resolve("@supabase/ssr")).href)}`);
    writeFileSync(join(dir, "session.mjs"), js);
    const S = await import(pathToFileURL(join(dir, "session.mjs")).href);
    const tok = (claims) => `x.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.y`;
    const T = 1_800_000_000;
    check("O1 sign-in time comes from the signed amr claim (password)", S.signInTime(tok({ amr: [{ method: "password", timestamp: T }] })) === T);
    check("O2 deadline = sign-in + 8 h", S.sessionDeadline(tok({ amr: [{ method: "password", timestamp: T }] })) === T + 8 * 3600);
    check("O3 refreshed token (new iat/exp, same amr) keeps the same deadline", S.sessionDeadline(tok({ iat: T + 7000, exp: T + 10600, amr: [{ method: "password", timestamp: T }] })) === T + 8 * 3600);
    check("O4 no amr → no deadline (treated as expired)", S.sessionDeadline(tok({ iat: T })) === null && S.sessionDeadline("garbage") === null);
    const o = S.enforcedCookieOptions({ maxAge: 400 * 24 * 3600, httpOnly: false, secure: false, sameSite: "none", path: "/x" }, T + 8 * 3600, T + 3600);
    check("O5 cookies are forced httpOnly, Secure, SameSite=Lax, path / and expire at the deadline (not 400 days)", o.httpOnly === true && o.secure === true && o.sameSite === "lax" && o.path === "/" && o.maxAge === 7 * 3600, o);
    check("O6 removals stay removals (maxAge 0)", S.enforcedCookieOptions({ maxAge: 0 }, T + 8 * 3600, T).maxAge === 0);
    check("O7 past the deadline → maxAge 0", S.enforcedCookieOptions({ maxAge: 3600 }, T + 8 * 3600, T + 9 * 3600).maxAge === 0);
    check("O8 unknown deadline → maxAge 0 (fail closed)", S.enforcedCookieOptions({ maxAge: 3600 }, null, T).maxAge === 0);

    // P2.2 cookie client (supabase-server.ts): cookies written during a server-side refresh keep the enforced options
    const resolveUrl = (spec) => JSON.stringify(pathToFileURL(req.resolve(spec)).href);
    const ssJs = ts.transpileModule(readFileSync(join(ROOT, "src/lib/cms/supabase-server.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
      .replace('from "@supabase/ssr"', `from ${resolveUrl("@supabase/ssr")}`)
      .replace('from "@supabase/supabase-js"', `from ${resolveUrl("@supabase/supabase-js")}`)
      .replace('from "next/headers"', `from ${resolveUrl("next/headers")}`)
      .replace('from "./session"', 'from "./session.mjs"');
    writeFileSync(join(dir, "supabase-server.mjs"), ssJs);
    const SS = await import(pathToFileURL(join(dir, "supabase-server.mjs")).href);
    const nowS = Math.floor(Date.now() / 1000);
    const cookieValue = (signedInAt) => "base64-" + Buffer.from(JSON.stringify({ access_token: tok({ amr: [{ method: "password", timestamp: signedInAt }], exp: nowS + 3600 }), refresh_token: "r", expires_at: nowS + 3600 })).toString("base64url");
    const lax = { maxAge: 400 * 24 * 3600, httpOnly: false, secure: false, sameSite: "none", path: "/x" };
    const one = SS.enforcedCookieWrites([{ name: `sb-${STAGING_REF}-auth-token`, value: cookieValue(nowS - 3600), options: lax }]);
    const oo = one[0].options;
    check("O9 P2.2 refresh write: forced httpOnly, Secure, SameSite=Lax, path / (ssr's own options ignored)", oo.httpOnly === true && oo.secure === true && oo.sameSite === "lax" && oo.path === "/", oo);
    check(`O10 P2.2 refresh write: lifetime ends at the original 8-hour deadline (maxAge ${oo.maxAge} ≈ ${7 * 3600})`, Math.abs(oo.maxAge - 7 * 3600) <= 3, oo.maxAge);
    const v = cookieValue(nowS - 7200);
    const chunked = SS.enforcedCookieWrites([{ name: `sb-${STAGING_REF}-auth-token.0`, value: v.slice(0, 40), options: lax }, { name: `sb-${STAGING_REF}-auth-token.1`, value: v.slice(40), options: lax }, { name: `sb-${STAGING_REF}-auth-token.2`, value: "", options: { maxAge: 0 } }]);
    check("O11 chunked session cookies: every chunk gets the same deadline; a removed chunk stays removed", chunked.slice(0, 2).every((c) => Math.abs(c.options.maxAge - 6 * 3600) <= 3 && c.options.httpOnly) && chunked[2].options.maxAge === 0, chunked.map((c) => c.options.maxAge));
    check("O12 session past its 8-hour deadline → written with maxAge 0", SS.enforcedCookieWrites([{ name: `sb-${STAGING_REF}-auth-token`, value: cookieValue(nowS - 9 * 3600), options: lax }])[0].options.maxAge === 0);
    const noAmr = "base64-" + Buffer.from(JSON.stringify({ access_token: tok({ exp: nowS + 3600 }) })).toString("base64url");
    check("O13 no readable sign-in time (no amr / garbage) → maxAge 0 (fail closed)", SS.enforcedCookieWrites([{ name: `sb-${STAGING_REF}-auth-token`, value: noAmr, options: lax }])[0].options.maxAge === 0 && SS.enforcedCookieWrites([{ name: `sb-${STAGING_REF}-auth-token`, value: "base64-not-json", options: lax }])[0].options.maxAge === 0);
  }

  // ---------------------------------------------------------------- HTTP: sign-in rules
  section("A. sign-in rules (HTTP)");
  // signed out is a normal answer from /api/auth/session: 200 { data: null } (the protected /api/admin routes stay 401)
  const signedOut = (r) => r.status === 200 && r.json !== undefined && r.json?.data === null;
  check("A1 no session → GET /api/auth/session 200 { data: null }", signedOut(await http("GET", "/api/auth/session")));
  const wrong = await http("POST", "/api/auth/login", { body: { email: env.adminEmail, password: "definitely-wrong-" + Date.now() } });
  check("A2 wrong password → 401, generic message, no session cookie", wrong.status === 401 && wrong.json?.error === GENERIC && !wrong.set.some((c) => c.name.startsWith("sb-") && c.value), { status: wrong.status, error: wrong.json?.error });
  const unknown = await http("POST", "/api/auth/login", { body: { email: `qa-unknown-${Date.now()}@invalid.example`, password: "x-unknown-pass" } });
  check("A3 unknown email → identical 401 response (no account enumeration)", unknown.status === 401 && unknown.json?.error === GENERIC);
  check("A4 malformed email → identical 401", (await http("POST", "/api/auth/login", { body: { email: "not-an-email", password: "x" } })).json?.error === GENERIC);
  check("A5 non-JSON body → 415", (await http("POST", "/api/auth/login", { rawBody: "email=a", headers: { "Content-Type": "text/plain" } })).status === 415);
  check("A6 foreign Origin → 403", (await http("POST", "/api/auth/login", { origin: "https://evil.example", body: { email: env.adminEmail, password: env.adminPassword } })).status === 403);
  check("A7 Sec-Fetch-Site: cross-site → 403", (await http("POST", "/api/auth/login", { headers: { "Sec-Fetch-Site": "cross-site" }, body: { email: env.adminEmail, password: env.adminPassword } })).status === 403);
  check("A8 no Origin header → 403 (login CSRF blocked)", (await http("POST", "/api/auth/login", { origin: null, body: { email: env.adminEmail, password: env.adminPassword } })).status === 403);

  section("B. non-admin user");
  if (!extra.QA_NONADMIN_EMAIL || !extra.QA_NONADMIN_PASSWORD) {
    // visibly PENDING, and counted as a failure, until the owner configures the user and B1–B7 actually run and pass
    check("B0 PENDING: non-admin checks B1–B7 not run — QA_NONADMIN_EMAIL / QA_NONADMIN_PASSWORD missing in .env.test.local (owner action D4)", false, "pending owner action D4");
  } else {
    const na = await http("POST", "/api/auth/login", { body: { email: extra.QA_NONADMIN_EMAIL, password: extra.QA_NONADMIN_PASSWORD } });
    check("B1 non-admin login → the same generic 401, and no session cookie kept", na.status === 401 && na.json?.error === GENERIC && !na.set.some((c) => c.name.startsWith("sb-") && c.value && c.attrs["max-age"] !== "0"), { status: na.status, set: na.set.map((c) => [c.name, c.attrs["max-age"]]) });
    const sbNA = createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } });
    const s = await sbNA.auth.signInWithPassword({ email: extra.QA_NONADMIN_EMAIL, password: extra.QA_NONADMIN_PASSWORD });
    check("B2 the non-admin user exists and can authenticate with Supabase directly (so B1 is a role refusal)", !s.error && !!s.data.session, s.error ? { status: s.error.status, code: s.error.code } : undefined);
    if (!s.data?.session) {
      // never a silent skip: each dependent check is reported as a failure
      for (const name of ["B3 non-admin Bearer token on the P2.2 API → 403", "B4 the non-admin user has no profile row", "B5 the non-admin user cannot give itself the admin role (insert refused)", "B6 the non-admin user cannot call set_active_hod", "B7 the non-admin user cannot write faculty (RLS)"]) check(`${name} — NOT RUN (B2 failed: no non-admin session)`, false);
    }
    if (s.data?.session) {
      const tokenNA = s.data.session.access_token;
      const api = await fetch(`${BASE}/api/admin/faculty`, { headers: { Authorization: `Bearer ${tokenNA}` } });
      check("B3 non-admin Bearer token on the P2.2 API → 403", api.status === 403, api.status);
      const prof = await sbNA.from("profiles").select("role").eq("user_id", s.data.user.id);
      check("B4 the non-admin user has no profile row", !prof.error && prof.data.length === 0, prof.error?.code ?? prof.data);
      const self = await sbNA.from("profiles").insert({ user_id: s.data.user.id, display_name: "x", role: "admin" });
      check("B5 the non-admin user cannot give itself the admin role (insert refused)", self.error?.code === "42501", self.error?.code);
      const rpc = await sbNA.rpc("set_active_hod", { p_faculty_id: "qa-hod-a" });
      check("B6 the non-admin user cannot call set_active_hod", !!rpc.error, rpc.error?.code);
      const w = await sbNA.from("faculty").insert({ id: "qa-auth-na", name: "x", designation: "x", sort_order: 1 });
      check("B7 the non-admin user cannot write faculty (RLS)", !!w.error, w.error?.code);
      await sbNA.auth.signOut({ scope: "local" });
    }
  }

  section("C. admin session (HTTP)");
  const jar = new Map();
  const login = await http("POST", "/api/auth/login", { jar, body: { email: env.adminEmail, password: env.adminPassword } });
  check("C1 admin login → 200 with { email, name, role: admin }", login.status === 200 && login.json?.data?.role === "admin" && !!login.json.data.name, { status: login.status, keys: Object.keys(login.json?.data ?? {}) });
  check("C2 the login response body contains no token", !/access_token|refresh_token|eyJ[A-Za-z0-9_-]{10,}\./.test(login.text));
  const sbCookies = login.set.filter((c) => c.name.startsWith("sb-") && c.value);
  const maxAges = sbCookies.map((c) => Number(c.attrs["max-age"]));
  check("C3 session cookies: HttpOnly, Secure, SameSite=Lax, Path=/", sbCookies.length > 0 && sbCookies.every((c) => c.attrs.httponly && c.attrs.secure && String(c.attrs.samesite).toLowerCase() === "lax" && c.attrs.path === "/"), sbCookies.map((c) => ({ n: c.name, a: c.attrs })));
  check(`C4 cookie lifetime = the 8-hour deadline (Max-Age ${maxAges.join(",")} s, ≤ 28800)`, maxAges.length > 0 && maxAges.every((m) => m > 28000 && m <= 28800), maxAges);
  const { session: firstSession, names } = sessionFromJar(jar);
  const amr = jwtClaims(firstSession?.access_token ?? "")?.amr;
  const signedAt = Array.isArray(amr) ? Math.min(...amr.map((x) => x.timestamp).filter(Number.isFinite)) : NaN;
  check("C5 Supabase's signed token carries the sign-in time (amr) used for the deadline", Number.isFinite(signedAt) && Math.abs(Date.now() / 1000 - signedAt) < 600, { amrPresent: Array.isArray(amr) });
  const sess = await http("GET", "/api/auth/session", { jar });
  check("C6 GET /api/auth/session with the cookie → the admin", sess.status === 200 && sess.json?.data?.role === "admin" && !/eyJ/.test(sess.text));
  check("C7 /admin with the cookie → 200 (no redirect)", (await http("GET", "/admin", { jar, origin: null })).status === 200);
  check("C8 a forged demo cookie added to a real session grants nothing extra (still the same admin)", (await http("GET", "/api/auth/session", { jar: new Map([...jar, ["sophia_demo_session", "manager%7Cmanager%40demo.local"]]) })).json?.data?.email === login.json?.data?.email);

  section("D. P2.2 API with the browser-style cookie session");
  const apiList = await http("GET", "/api/admin/faculty", { jar });
  check("D1 GET /api/admin/faculty with the session cookie (no Bearer) → 200", apiList.status === 200 && Array.isArray(apiList.json?.data), apiList.status);
  await http("DELETE", "/api/admin/faculty/qa-auth-c", { jar });
  const created = await http("POST", "/api/admin/faculty", { jar, body: { id: "qa-auth-c", name: "QA Auth C", designation: "QA", sortOrder: 960 } });
  check("D2 cookie-session write (same Origin) → 201", created.status === 201, created.status);
  check("D3 cookie-session write without Origin → 403", (await http("PATCH", "/api/admin/faculty/qa-auth-c", { jar, origin: null, body: { designation: "x" } })).status === 403);
  check("D4 cookie-session write with a foreign Origin → 403", (await http("PATCH", "/api/admin/faculty/qa-auth-c", { jar, origin: "https://evil.example", body: { designation: "x" } })).status === 403);
  check("D5 cookie-session delete → 204", (await http("DELETE", "/api/admin/faculty/qa-auth-c", { jar })).status === 204);

  section("E. forged, tampered and refreshed sessions");
  const demoOnly = new Map([["sophia_demo_session", "admin%7Cadmin%40demo.local"]]);
  const demoAdmin = await http("GET", "/admin", { jar: demoOnly, origin: null });
  check("E1 forged demo admin cookie → /admin redirects to /login", demoAdmin.status >= 300 && demoAdmin.status < 400 && /\/login\?next=%2Fadmin/.test(demoAdmin.location ?? ""), { status: demoAdmin.status, location: demoAdmin.location });
  check("E2 forged demo admin cookie → session { data: null } and P2.2 API 401", signedOut(await http("GET", "/api/auth/session", { jar: demoOnly })) && (await http("GET", "/api/admin/faculty", { jar: demoOnly })).status === 401);
  if (firstSession) {
    const parts = firstSession.access_token.split(".");
    const tampered = jarWithSession({ ...firstSession, access_token: `${parts[0]}.${parts[1]}.${parts[2].slice(0, -3)}abc` }, names);
    const t1 = await http("GET", "/api/auth/session", { jar: tampered });
    check("E3 tampered access token → { data: null } and the cookie is cleared", signedOut(t1) && t1.set.some((c) => c.name.startsWith("sb-") && c.attrs["max-age"] === "0"), { status: t1.status });
    const fakeClaims = Buffer.from(JSON.stringify({ ...jwtClaims(firstSession.access_token), exp: Math.floor(Date.now() / 1000) - 60 })).toString("base64url");
    const expired = jarWithSession({ ...firstSession, access_token: `${parts[0]}.${fakeClaims}.${parts[2]}`, refresh_token: "invalid-refresh-token", expires_at: Math.floor(Date.now() / 1000) - 60 }, names);
    const e4 = await http("GET", "/admin", { jar: expired, origin: null });
    check("E4 expired token with an unusable refresh token → /admin redirects to login", e4.status >= 300 && e4.status < 400 && /\/login/.test(e4.location ?? ""), { status: e4.status });
    // refresh: mark the real session as expired; the server must refresh it and keep the original deadline
    const before = Number(sbCookies[0]?.attrs["max-age"]);
    const forced = jarWithSession({ ...firstSession, expires_at: Math.floor(Date.now() / 1000) - 5 }, names);
    await sleep(1500);
    const r = await http("GET", "/api/auth/session", { jar: forced });
    const refreshed = sessionFromJar(forced).session;
    const newAges = r.set.filter((c) => c.name.startsWith("sb-") && c.value).map((c) => Number(c.attrs["max-age"]));
    check("E5 an expired access token is refreshed by the server → 200 with new tokens", r.status === 200 && !!refreshed && refreshed.access_token !== firstSession.access_token, { status: r.status, refreshed: !!refreshed && refreshed.access_token !== firstSession.access_token });
    check(`E6 the refresh does NOT extend the deadline (new Max-Age ${newAges.join(",")} ≤ original ${before})`, newAges.length > 0 && newAges.every((m) => m <= before && m > 0), { newAges, before });
    check("E7 refreshed cookies are still HttpOnly, Secure, SameSite=Lax", r.set.filter((c) => c.name.startsWith("sb-") && c.value).every((c) => c.attrs.httponly && c.attrs.secure && String(c.attrs.samesite).toLowerCase() === "lax"));
    const refreshedClaims = jwtClaims(refreshed?.access_token ?? "");
    check("E8 the refreshed token keeps the original sign-in time (amr)", Array.isArray(refreshedClaims?.amr) && Math.min(...refreshedClaims.amr.map((x) => x.timestamp)) === signedAt);
    // the refreshed jar is now the live session; carry on with it
    for (const [k, v] of forced) jar.set(k, v);
  }

  section("F. sign-out");
  check("F1 cross-site sign-out → 403", (await http("POST", "/api/auth/logout", { jar, origin: "https://evil.example" })).status === 403);
  const liveBeforeLogout = new Map(jar);
  const out = await http("POST", "/api/auth/logout", { jar });
  check("F2 sign-out → 200 and every Supabase cookie removed (Max-Age=0)", out.status === 200 && out.set.filter((c) => c.name.startsWith("sb-")).every((c) => c.attrs["max-age"] === "0") && [...jar.keys()].every((k) => !k.startsWith("sb-")), { status: out.status });
  check("F3 the old cookie after sign-out → session { data: null }", signedOut(await http("GET", "/api/auth/session", { jar: new Map(liveBeforeLogout) })));
  check("F4 the old cookie after sign-out → /admin redirects, P2.2 API 401", (await http("GET", "/admin", { jar: new Map(liveBeforeLogout), origin: null })).status === 307 && (await http("GET", "/api/admin/faculty", { jar: new Map(liveBeforeLogout) })).status === 401);
  const old = sessionFromJar(liveBeforeLogout).session;
  if (old) {
    const reuse = jarWithSession({ ...old, expires_at: Math.floor(Date.now() / 1000) - 5 }, names);
    check("F5 the revoked refresh token can't be used to refresh the session → { data: null }", signedOut(await http("GET", "/api/auth/session", { jar: reuse })));
  }
  check("F6 sign-out without a session is harmless (200)", (await http("POST", "/api/auth/logout", {})).status === 200);

  section("G. rate limit, sign-up, headers");
  const rlEmail = `qa-ratelimit-${Date.now()}@invalid.example`;
  const rl = [];
  for (let i = 0; i < 6; i++) rl.push(await http("POST", "/api/auth/login", { body: { email: rlEmail, password: "x-wrong" } }));
  const last = rl.at(-1);
  check(`G1 5 attempts per minute per email: attempts 1–5 → 401, attempt 6 → 429 (${rl.map((r) => r.status).join(",")})`, rl.slice(0, 5).every((r) => r.status === 401) && last.status === 429, rl.map((r) => r.status));
  const xff = await http("POST", "/api/auth/login", { headers: { "X-Forwarded-For": `203.0.113.${Math.floor(Math.random() * 200)}` }, body: { email: rlEmail, password: "x-wrong" } });
  check("G2 a spoofed X-Forwarded-For header does not reset the limit (still 429)", xff.status === 429, xff.status);
  const settings = await (await fetch(`${env.url}/auth/v1/settings`, { headers: { apikey: env.key } })).json().catch(() => null);
  check("G3 public sign-up is disabled on staging (read-only settings check)", settings?.disable_signup === true, settings?.disable_signup);
  check(`G4 every /api/auth and /api/admin response is no-store (${apiResponses} responses)`, noStoreViolations === 0 && apiResponses > 0, noStoreViolations);
  check("G5 no Supabase cookie was ever sent without HttpOnly", nonHttpOnlyCookies === 0, nonHttpOnlyCookies);

  // ---------------------------------------------------------------- real browser
  section("H. real browser (headless Chrome, throw-away profile)");
  const page = await launch(9621);
  const SET = (sel, value) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`;
  // wait for a condition instead of a fixed delay: an admin navigation makes several Supabase round trips (2–4 s here)
  const waitFor = async (expression, timeoutMs = 15000) => {
    for (const end = Date.now() + timeoutMs; Date.now() < end; await sleep(250)) if (await page.ev(expression).catch(() => false)) return true;
    return false;
  };
  const fillAndSubmit = async (scope) => {
    await page.ev(SET(`${scope} input[type=email]`, env.adminEmail));
    await page.ev(SET(`${scope} input[type=password]`, env.adminPassword));
    await page.ev(`document.querySelector(${JSON.stringify(`${scope} button[type=submit]`)}).click(), true`);
    await waitFor(`location.pathname === "/admin" && !document.body.innerText.includes("Checking session")`);
  };
  try {
    await page.viewport("desktop");
    await page.goto(BASE + "/admin", 1500);
    check("H1 /admin signed out → /login?next=%2Fadmin", (await page.ev("location.pathname + location.search")) === "/login?next=%2Fadmin");
    const ui = await page.ev(`({ title: document.title, notice: document.body.innerText.includes("Sign in with your Sophia Forum admin account."), demoNotice: document.body.innerText.includes("Demo sign-in only."), creds: document.body.innerText.toLowerCase().includes("demo credentials"), button: [...document.querySelectorAll('main form button[type=submit]')].map(b => b.innerText.trim()) })`);
    check("H2 login page (D3): Admin Sign In title, admin notice, no demo credentials, SIGN IN", ui.title === "Admin Sign In | SOPHIA FORUM" && ui.notice && !ui.demoNotice && !ui.creds && ui.button.includes("SIGN IN"), ui);
    const wording = await page.ev(`({ intro: document.querySelector('main h1')?.parentElement?.querySelector('p')?.innerText ?? "", placeholder: document.querySelector('main input[type=email]')?.placeholder })`);
    check("H2b login page wording (follow-up): 'Sign in to your Sophia Forum admin account to open /admin.' and placeholder you@example.com", wording.intro === "Sign in to your Sophia Forum admin account to open /admin." && wording.placeholder === "you@example.com", wording);
    await page.ev(SET("main input[type=email]", env.adminEmail));
    await page.ev(SET("main input[type=password]", "definitely-wrong-browser"));
    await page.ev(`document.querySelector('main button[type=submit]').click(), true`);
    await sleep(2500);
    check("H3 wrong password in the form → generic message, stays on /login", (await page.ev(`document.querySelector('main [role=alert]').innerText.trim()`)) === GENERIC && (await page.ev("location.pathname")) === "/login");
    await fillAndSubmit("main");
    const shell = await page.ev(`({ path: location.pathname, notice: document.body.innerText.includes(${JSON.stringify(D3_SHELL)}), checking: document.body.innerText.includes("Checking"), users: [...document.querySelectorAll('nav[aria-label="Admin sections"] a')].map(a => a.innerText.trim()) })`);
    // innerText follows CSS text-transform (the tabs render uppercase), so compare case-insensitively
    check("H4 sign-in via the login page → /admin with the D3 notice and all tabs incl. Users", shell.path === "/admin" && shell.notice && !shell.checking && shell.users.map((u) => u.toLowerCase()).includes("users"), shell);
    const cookies = (await page.cookies()).filter((c) => c.name.startsWith("sb-"));
    check("H5 browser cookies: httpOnly, secure, SameSite=Lax", cookies.length > 0 && cookies.every((c) => c.httpOnly && c.secure && c.sameSite === "Lax"), cookies.map((c) => ({ n: c.name, h: c.httpOnly, s: c.secure, ss: c.sameSite })));
    check("H6 page JavaScript cannot read any Supabase cookie (document.cookie)", !(await page.ev(`document.cookie.includes("sb-")`)));
    check("H7 page JavaScript sees no token (local/session storage)", !(await page.ev(`JSON.stringify(localStorage).includes("access_token") || JSON.stringify(sessionStorage).includes("access_token")`)));
    const apiGet = await page.ev(`fetch('/api/admin/faculty').then(r => r.status)`);
    const apiPost = await page.ev(`fetch('/api/admin/faculty', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'qa-auth-h', name: 'QA Auth H', designation: 'QA', sortOrder: 961 }) }).then(r => r.status)`);
    const apiDel = await page.ev(`fetch('/api/admin/faculty/qa-auth-h', { method: 'DELETE' }).then(r => r.status)`);
    check(`H8 P2.2 API from the real browser session: GET ${apiGet}, POST ${apiPost}, DELETE ${apiDel}`, apiGet === 200 && apiPost === 201 && apiDel === 204);
    await waitFor(`[...document.querySelectorAll('button')].some(b => (b.getAttribute('aria-label') || '').startsWith('Account menu ('))`);
    await page.ev(`[...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').startsWith('Account menu (')).click(), true`);
    await sleep(400);
    check("H9 navbar account menu says 'Admin session' (D3; rendered uppercase by CSS)", await page.ev(`document.body.innerText.toLowerCase().includes("admin session")`));
    for (const tab of ["/admin/events", "/admin/faculty", "/admin/users"]) {
      await page.goto(BASE + tab, 1800);
      await waitFor(`!document.body.innerText.includes("Checking session")`);
      check(`H10 navigating to ${tab} keeps the session`, (await page.ev("location.pathname")) === tab && !(await page.ev(`document.body.innerText.includes("Checking session")`)));
    }
    await page.goto(BASE + "/login?next=https://evil.example", 1500);
    await waitFor(`location.pathname !== "/login"`);
    check("H11 /login?next=https://evil.example while signed in → /admin (open redirect blocked)", (await page.ev("location.href")) === BASE + "/admin");
    await page.ev(`[...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'SIGN OUT').click(), true`);
    await waitFor(`location.pathname === "/login"`);
    check("H12 SIGN OUT in the dashboard → /login and the Supabase cookies are gone", (await page.ev("location.pathname")) === "/login" && (await page.cookies()).every((c) => !c.name.startsWith("sb-")));
    await page.setCookie("sophia_demo_session", "admin%7Cadmin%40demo.local", BASE);
    await page.goto(BASE + "/admin", 1500);
    const forged = await page.ev(`({ path: location.pathname, lock: !!document.querySelector('button[aria-label="Sign in / Admin Access"]') })`);
    check("H13 forged demo cookie in the browser → /admin redirects to /login; navbar stays signed out", forged.path === "/login" && forged.lock, forged);
    await page.clearCookies();
    await page.goto(BASE + "/", 1500);
    await page.ev(`document.querySelector('button[aria-label="Sign in / Admin Access"]').click(), true`);
    await sleep(600);
    const modal = await page.ev(`({ open: !!document.querySelector('[role=dialog]'), text: document.querySelector('[role=dialog]')?.innerText ?? "" })`);
    check("H14 the login modal shows 'Sophia Forum admin area.' and no demo credentials", modal.open && modal.text.includes("Sophia Forum admin area.") && !modal.text.toLowerCase().includes("demo credentials"), { open: modal.open });
    await fillAndSubmit("[role=dialog]");
    check("H15 sign-in via the modal → /admin", (await page.ev("location.pathname")) === "/admin");
    await page.viewport("mobile");
    await page.goto(BASE + "/", 1500);
    await page.ev(`document.querySelector('button[aria-label="Open navigation menu"]').click(), true`);
    await sleep(600);
    const mobileSignOut = await page.ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /^SIGN OUT \\(/.test(x.innerText.trim())); if (!b) return false; b.click(); return true; })()`);
    await sleep(2500);
    check("H16 mobile menu SIGN OUT (admin) → Supabase cookies removed", mobileSignOut && (await page.cookies()).every((c) => !c.name.startsWith("sb-")), { clicked: mobileSignOut });
    check("H17 no console errors in the browser run (excluding expected 401 from session checks)", page.errors.filter((e) => !/401|404/.test(e)).length === 0, page.errors);
  } finally { await page.close(); }
}

const passed = checks.filter((c) => c.ok).length;
console.log(`\n${passed}/${checks.length} checks passed (mode=${MODE})`);
const outDir = join(ROOT, "qa/cms-auth/results");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `cms-auth-${MODE}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`), JSON.stringify({ project: `staging (${env.ref.slice(0, 4)}…)`, base: BASE, mode: MODE, passed, total: checks.length, checks }, null, 1));
process.exit(passed === checks.length ? 0 : 1);
