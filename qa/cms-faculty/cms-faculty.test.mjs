// Sophia CMS P2.4 Faculty Manager tests: sophia-cms-staging ONLY, against a LOCAL Next.js server.
//   node qa/cms-faculty/cms-faculty.test.mjs --mode backend      --base http://localhost:3010   (built with CMS_AUTH_MODE=supabase
//                                                                                                 + CMS_FACULTY_MODE=backend, started with CMS_FACULTY_MODE=backend)
//   node qa/cms-faculty/cms-faculty.test.mjs --mode unavailable  --base http://localhost:3010   (built with CMS_AUTH_MODE=demo + CMS_FACULTY_MODE=backend)
//   node qa/cms-faculty/cms-faculty.test.mjs --mode demo         --base http://localhost:3000   (default build: demo Faculty Manager unchanged)
// Credentials come from .env.test.local (values never printed). The suite only creates, changes and deletes its own
// qa-p24-* records; existing staging records are compared before and after and never written. HOD checks run only
// when staging has no active HOD, and the suite leaves it with none. Backend failures are simulated in the browser
// with the CDP Fetch domain (the server and the database are never broken on purpose).
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { createClient } from "@supabase/supabase-js";
import { loadQaEnv, redact, STAGING_REF } from "../cms-db/lib/env.mjs";
import { launch, sleep } from "../suites/lib/cdp.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const MODE = arg("mode", "backend");
const BASE = arg("base", MODE === "demo" ? "http://localhost:3000" : "http://localhost:3010").replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE)) { console.error("REFUSED: --base must be a local server."); process.exit(2); }
if (!["backend", "unavailable", "demo"].includes(MODE)) { console.error("REFUSED: --mode must be backend, unavailable or demo."); process.exit(2); }

const env = loadQaEnv(ROOT);
const appRef = readFileSync(join(ROOT, ".env.local"), "utf8").match(/NEXT_PUBLIC_SUPABASE_URL\s*=\s*https:\/\/([a-z0-9]{20})\.supabase\.co/)?.[1];
if (appRef !== STAGING_REF) { console.error("REFUSED: the server's .env.local does not point at sophia-cms-staging."); process.exit(2); }
const extra = Object.fromEntries(readFileSync(join(ROOT, ".env.test.local"), "utf8").split(/\r?\n/).map((l) => l.match(/^\s*(QA_NONADMIN_(?:EMAIL|PASSWORD))\s*=\s*(.*?)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^(['"])(.*)\1$/, "$2")]));
const secrets = [env.key, env.adminPassword, env.adminEmail, extra.QA_NONADMIN_PASSWORD, extra.QA_NONADMIN_EMAIL].filter(Boolean);
const scrub = (s) => { let out = redact(String(s), env); for (const v of secrets) out = out.split(v).join("[redacted]"); return out; };

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok: !!ok, ...(ok || detail === undefined ? {} : { detail: scrub(JSON.stringify(detail)).slice(0, 1500) }) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : "  — " + scrub(JSON.stringify(detail)).slice(0, 300)}`);
};
const notRun = (name, why) => check(`${name} (NOT RUN: ${why})`, false);
const section = (t) => console.log(`\n== ${t}`);

// approved texts (D9: F1–F5, T1–T6)
const T1 = "Saved to the Sophia Forum CMS.";
// T5/T6 as updated when Team, Events, Gallery and Content moved to the CMS (migration 7b)
const T5 = "Faculty, Team, Events, Gallery and site content are live. Users is still a local demo stored in this browser.";
const T6 = "All local edits to users will be lost. Faculty, Team, Events, Gallery and site content are stored in the CMS and are not affected.";
const DEMO_EDIT = "Mock data — saved only in this browser.";
const DEMO_RESET = "All local edits to events, gallery, team, faculty and users will be lost.";
const HOD_RULE = "Only a published faculty record can be the active HOD. Tick Published first.";
const AIDS = "Artificial Intelligence & Data Science";
const STATIC_NAMES = [...readFileSync(join(ROOT, "src/data/staticFaculty.ts"), "utf8").split("export const STATIC_FACULTY")[1].matchAll(/^\s+name:\s*"([^"]+)"/gm)].map((m) => m[1]);

// ---------------------------------------------------------------- offline: the real mode function and source rules
section("offline: facultyManagerMode() (real src/lib/cms/mode.ts) and no-fallback source rules");
{
  const req = createRequire(join(ROOT, "package.json"));
  const ts = req("typescript");
  const dir = join(tmpdir(), `cms-mode-${Date.now()}`); mkdirSync(dir, { recursive: true });
  try {
    writeFileSync(join(dir, "mode.mjs"), ts.transpileModule(readFileSync(join(ROOT, "src/lib/cms/mode.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
    const M = await import(pathToFileURL(join(dir, "mode.mjs")).href);
    const saved = { a: process.env.CMS_AUTH_MODE, f: process.env.CMS_FACULTY_MODE };
    const table = [[undefined, undefined, "demo"], ["supabase", undefined, "demo"], ["supabase", "demo", "demo"], ["demo", "backend", "unavailable"], [undefined, "backend", "unavailable"], ["supabase", "backend", "backend"], ["SUPABASE", "backend", "unavailable"], ["supabase", "Backend", "demo"]];
    const got = table.map(([a, f]) => { if (a === undefined) delete process.env.CMS_AUTH_MODE; else process.env.CMS_AUTH_MODE = a; if (f === undefined) delete process.env.CMS_FACULTY_MODE; else process.env.CMS_FACULTY_MODE = f; return M.facultyManagerMode(); });
    if (saved.a === undefined) delete process.env.CMS_AUTH_MODE; else process.env.CMS_AUTH_MODE = saved.a;
    if (saved.f === undefined) delete process.env.CMS_FACULTY_MODE; else process.env.CMS_FACULTY_MODE = saved.f;
    check("O1 backend only when BOTH CMS_FACULTY_MODE=backend and CMS_AUTH_MODE=supabase; backend+demo sign-in → unavailable; else demo", got.every((g, i) => g === table[i][2]), got);
  } finally { rmSync(dir, { recursive: true, force: true }); }

  const page = readFileSync(join(ROOT, "src/app/admin/faculty/page.tsx"), "utf8");
  const backendPart = page.slice(page.indexOf("function BackendFacultyManager"), page.indexOf("export default function"));
  const hook = readFileSync(join(ROOT, "src/hooks/useCmsFaculty.ts"), "utf8");
  check("O2 the backend Faculty Manager never reads or writes the demo store", backendPart.length > 100 && !/useDemoCollection|setDemoCollection|demoStore|localStorage/.test(backendPart), backendPart.length);
  check("O3 useCmsFaculty talks only to /api/admin (no demo store, no storage, no Supabase client, no keys)", !/demoStore|localStorage|sessionStorage|@supabase|supabase\.co|NEXT_PUBLIC|service_role/.test(hook) && /\/api\/admin\/faculty/.test(hook) && /\/api\/admin\/hod"/.test(hook), null);
  // Phase 2 (media uploads): the backend form has the photo as an upload field with its permission; demo keeps Photo URL
  check("O4 backend page: photo is an upload field with Photo permission; the demo FIELDS keep Photo URL", /name: "image", label: "Photo", type: "image"/.test(page.slice(page.indexOf("const BACKEND_FIELDS"), page.indexOf("const status"))) && /name: "imageConsent"/.test(page) && /name: "image", label: "Photo URL"/.test(page.slice(0, page.indexOf("const BACKEND_FIELDS"))), null);
  const crud = readFileSync(join(ROOT, "src/components/admin/CrudManager.tsx"), "utf8");
  check("O5 CrudManager keeps the demo dialog texts as defaults", crud.includes(`editDescription ?? "${DEMO_EDIT}"`) && crud.includes(`will be removed from this browser's demo data. The public site is not affected.`), null);
}

// ---------------------------------------------------------------- browser helpers
const page = await launch(9630);
const requests = [];          // { method, url }
const apiNoStore = { seen: 0, missing: [] };
page.on("Network.requestWillBeSent", (p) => requests.push({ method: p.request.method, url: p.request.url }));
page.on("Network.responseReceived", (p) => {
  if (!p.response.url.startsWith(BASE + "/api/")) return;
  apiNoStore.seen++;
  const cc = Object.entries(p.response.headers).find(([k]) => k.toLowerCase() === "cache-control")?.[1] ?? "";
  if (!/no-store/.test(cc)) apiNoStore.missing.push(p.response.url.slice(BASE.length));
});
// in-flight /api/admin requests, so a step waits for the server's answer instead of a fixed sleep
const inflight = new Set();
page.on("Network.requestWillBeSent", (p) => { if (p.request.url.startsWith(BASE + "/api/admin/")) inflight.add(p.requestId); });
page.on("Network.loadingFinished", (p) => inflight.delete(p.requestId));
page.on("Network.loadingFailed", (p) => inflight.delete(p.requestId));
async function settle(ms = 15000) {
  await sleep(200);
  const end = Date.now() + ms;
  let quietSince = inflight.size ? 0 : Date.now();
  while (Date.now() < end) {
    if (inflight.size) quietSince = 0; else if (!quietSince) quietSince = Date.now();
    if (quietSince && Date.now() - quietSince > 500 && !(await page.ev(`!!document.querySelector('[role=dialog] button[disabled]')`))) return;
    await sleep(100);
  }
}
const apiCalls = (method, pathRe) => requests.filter((r) => r.method === method && r.url.startsWith(BASE) && pathRe.test(new URL(r.url).pathname)).length;
const anyAdminApi = () => requests.filter((r) => r.url.startsWith(BASE + "/api/admin/")).length;

// browser-side fault injection for /api/admin/* (CDP Fetch); `intercept` = { method, path: RegExp, respond: {status, body} | "fail" | {delay} }
let intercept = null;
await page.send("Fetch.enable", { patterns: [{ urlPattern: "*/api/admin/*", requestStage: "Request" }] });
page.on("Fetch.requestPaused", async (p) => {
  const u = new URL(p.request.url);
  const rule = intercept && intercept.method === p.request.method && intercept.path.test(u.pathname) ? intercept : null;
  try {
    if (!rule) return await page.send("Fetch.continueRequest", { requestId: p.requestId });
    if (rule.respond === "fail") return await page.send("Fetch.failRequest", { requestId: p.requestId, errorReason: "ConnectionRefused" });
    if (rule.respond.delay) { await sleep(rule.respond.delay); return await page.send("Fetch.continueRequest", { requestId: p.requestId }); }
    await page.send("Fetch.fulfillRequest", {
      requestId: p.requestId, responseCode: rule.respond.status,
      responseHeaders: [{ name: "Content-Type", value: "application/json; charset=utf-8" }, { name: "Cache-Control", value: "no-store, max-age=0" }],
      body: Buffer.from(JSON.stringify(rule.respond.body)).toString("base64"),
    });
  } catch {}
});

const waitFor = async (expr, ms = 10000) => { const end = Date.now() + ms; let v; while (Date.now() < end) { try { v = await page.ev(expr); if (v) return v; } catch {} await sleep(150); } return v; };
const setField = (name, value) => page.ev(`(() => { const el = document.querySelector('[role=dialog] [name="${name}"]'); if (!el) return false; const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
const setCheck = (name, on) => page.ev(`(() => { const el = document.querySelector('[role=dialog] [name="${name}"]'); if (!el) return false; if (el.checked !== ${on}) el.click(); return el.checked === ${on}; })()`);
const clickBtn = (label, scope = "") => page.ev(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(scope + " button")})].find((x) => x.innerText.trim() === ${JSON.stringify(label)} || x.getAttribute("aria-label") === ${JSON.stringify(label)}); if (!b) return false; b.click(); return true; })()`);
const submitDialog = async () => { const ok = await page.ev(`(() => { const b = document.querySelector('[role=dialog] button[type=submit]'); if (!b) return false; b.click(); return true; })()`); await settle(); return ok; };
const dialog = () => page.ev(`(() => { const d = document.querySelector('[role=dialog]'); if (!d) return null; const desc = d.getAttribute("aria-describedby"); return {
  title: (d.querySelector("h2")?.innerText ?? "").trim(), description: desc ? (document.getElementById(desc)?.innerText ?? "").trim() : "",
  alerts: [...d.querySelectorAll("[role=alert]")].map((a) => a.innerText.trim()),
  fieldErrors: Object.fromEntries([...d.querySelectorAll('[id$="-error"]')].map((e) => [e.id.replace(/^.*-([A-Za-z]+)-error$/, "$1"), e.innerText.trim()])),
  names: [...d.querySelectorAll("[name]")].map((e) => e.getAttribute("name")), labels: [...d.querySelectorAll("label")].map((l) => l.innerText.replace(/\\s*\\*$/, "").trim().toLowerCase()),
  values: Object.fromEntries([...d.querySelectorAll("[name]")].map((e) => [e.getAttribute("name"), e.type === "checkbox" ? e.checked : e.value])),
  pending: !!d.querySelector("button[disabled]") }; })()`);
const statusText = () => page.ev(`document.querySelector('p[role=status][aria-live=polite]')?.innerText.trim() ?? ""`);
// the faculty table only (the page also has the leadership and HOD-message tables below it)
const tableNames = () => page.ev(`[...(document.querySelector("table")?.querySelectorAll("tbody tr") ?? [])].filter((r) => r.children.length > 1).map((r) => r.children[1].innerText.trim())`);
const bodyText = () => page.ev(`document.body.innerText`);
const closeDialog = async () => { await clickBtn("CANCEL", "[role=dialog]") || await clickBtn("OK", "[role=dialog]"); await waitFor(`!document.querySelector('[role=dialog]')`, 3000); };
const lc = (s) => String(s ?? "").toLowerCase();

// direct API helpers (admin / non-admin Bearer tokens; the app's routes, never the database directly)
async function tokenFor(email, password) {
  if (!email || !password) return null;
  const c = createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } });
  const r = await c.auth.signInWithPassword({ email, password });
  return r.error ? null : { token: r.data.session.access_token, client: c };
}
async function api(method, path, { token, body, origin } = {}) {
  const h = {};
  if (token) h.Authorization = `Bearer ${token}`;
  if (origin) h.Origin = origin;
  if (body !== undefined) h["Content-Type"] = "application/json";
  const r = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json };
}

let exitCode = 0;
try {
  await page.viewport("desktop");

  if (MODE === "demo") {
    // ---------------------------------------------------------------- demo mode: unchanged Faculty Manager
    section("demo mode: the Faculty Manager is unchanged and never calls the CMS API");
    await page.goto(BASE + "/login?next=%2Fadmin%2Ffaculty", 1500);
    await clickBtn("Fill in the admin demo credentials"); await sleep(200);
    await page.ev(`document.querySelector('main button[type=submit]').click(), true`);
    const path = await waitFor(`location.pathname === "/admin/faculty" && document.querySelectorAll("tbody tr").length > 1 && location.pathname`);
    check("DM1 demo sign-in → /admin/faculty shows the demo table", path === "/admin/faculty");
    const names = await tableNames();
    check("DM2 the table lists the src/data faculty (demo store seed)", STATIC_NAMES.every((n) => names.includes(n)) && names.length === STATIC_NAMES.length, { names: names.length, seed: STATIC_NAMES.length });
    check("DM3 demo shell notice unchanged", (await bodyText()).includes("Demo admin — mock data only."));
    await clickBtn("ADD FACULTY MEMBER"); await waitFor(`!!document.querySelector('[role=dialog]')`);
    const d = await dialog();
    check("DM4 demo add dialog unchanged: demo description, Photo URL, no LinkedIn/Published/Active HOD, department Computer Science & Engineering",
      d.description === DEMO_EDIT && d.names.includes("image") && !d.names.some((n) => ["linkedin", "isPublished", "isActiveHod"].includes(n)) && d.values.department === "Computer Science & Engineering", d);
    await setField("name", "QA Demo Faculty"); await setField("designation", "QA"); await setField("image", "/images/x.png");
    await submitDialog(); await sleep(400);
    check("DM5 a demo add still saves locally", (await statusText()) === `Faculty member "QA Demo Faculty" added.` && (await tableNames()).includes("QA Demo Faculty"), await statusText());
    await clickBtn("Delete QA Demo Faculty"); await sleep(250);
    const dd = await dialog();
    check("DM6 demo delete dialog text unchanged", dd.description === `"QA Demo Faculty" will be removed from this browser's demo data. The public site is not affected.`, dd.description);
    await clickBtn("DELETE", "[role=dialog]"); await sleep(400);
    check("DM7 demo delete works", !(await tableNames()).includes("QA Demo Faculty"));
    await page.goto(BASE + "/admin", 1500);
    await clickBtn("RESET DATA"); await sleep(250);
    check("DM8 demo reset confirmation unchanged", (await dialog())?.description === DEMO_RESET, (await dialog())?.description);
    await closeDialog();
    check("DM9 no request to /api/admin/* in demo mode", anyAdminApi() === 0, anyAdminApi());
  } else if (MODE === "unavailable") {
    // ---------------------------------------------------------------- backend API with demo sign-in: error, never demo data
    section("unavailable: CMS_FACULTY_MODE=backend with demo sign-in shows an error and no demo data");
    await page.goto(BASE + "/login?next=%2Fadmin%2Ffaculty", 1500);
    await clickBtn("Fill in the admin demo credentials"); await sleep(200);
    await page.ev(`document.querySelector('main button[type=submit]').click(), true`);
    const msg = await waitFor(`location.pathname === "/admin/faculty" && document.querySelector('main [role=alert]')?.innerText.trim()`);
    check("UA1 /admin/faculty shows 'Faculty requires admin sign-in.'", msg === "Faculty requires admin sign-in.", msg);
    const t = await bodyText();
    check("UA2 no table, no ADD button, no demo faculty names", !(await page.ev(`!!document.querySelector("table")`)) && !t.includes("ADD FACULTY MEMBER") && STATIC_NAMES.every((n) => !t.includes(n)));
    check("UA3 demo shell notice unchanged (demo sign-in)", t.includes("Demo admin — mock data only."));
    check("UA4 the page made no /api/admin request", anyAdminApi() === 0, anyAdminApi());
    const r = await api("GET", "/api/admin/faculty");
    check("UA5 the API itself is on but refuses without a Supabase session (401)", r.status === 401, r.status);
    await page.goto(BASE + "/admin", 1500);
    await clickBtn("RESET DATA"); await sleep(250);
    check("UA6 reset confirmation keeps the demo wording (Faculty is not on the backend here)", (await dialog())?.description === DEMO_RESET);
    await closeDialog();
  } else {
    // ---------------------------------------------------------------- backend mode
    const admin = await tokenFor(env.adminEmail, env.adminPassword);
    if (!admin) throw new Error("admin sign-in for the API helpers failed");
    const A = (method, path, body) => api(method, path, { token: admin.token, body });
    const list = async () => { const r = await A("GET", "/api/admin/faculty"); if (r.status !== 200) throw new Error(`list ${r.status}`); return r.json.data; };
    const byId = async (id) => (await list()).find((f) => f.id === id) ?? null;

    section("setup: staging snapshot (read-only) and this suite's own leftovers");
    for (const f of (await list()).filter((x) => x.id.startsWith("qa-p24-"))) {
      if (f.isActiveHod) await A("DELETE", "/api/admin/hod");
      await A("DELETE", `/api/admin/faculty/${f.id}`);
    }
    const before = await list();
    const others = before.filter((f) => !f.id.startsWith("qa-p24-"));
    const hodAtStart = before.find((f) => f.isActiveHod) ?? null;
    const hodAllowed = !hodAtStart;
    check("S0 staging has no active HOD, so the HOD checks may run and must leave none", hodAllowed, hodAtStart?.id);
    const messages = (await A("GET", "/api/admin/hod-messages")).json?.data ?? [];

    section("access: unauthenticated and non-admin");
    await page.goto(BASE + "/admin/faculty", 1500);
    check("U1 /admin/faculty without a session → /login?next=%2Fadmin%2Ffaculty", (await page.ev("location.pathname + location.search")) === "/login?next=%2Fadmin%2Ffaculty");
    check("U2 GET /api/admin/faculty without a session → 401", (await api("GET", "/api/admin/faculty")).status === 401);
    check("U3 POST /api/admin/faculty without a session → 401", (await api("POST", "/api/admin/faculty", { origin: BASE, body: { id: "qa-p24-x", name: "x", designation: "x", sortOrder: 1 } })).status === 401);
    const nonAdmin = await tokenFor(extra.QA_NONADMIN_EMAIL, extra.QA_NONADMIN_PASSWORD);
    if (!nonAdmin) { notRun("N1 non-admin GET → 403", "non-admin sign-in failed"); notRun("N2 non-admin POST → 403", "non-admin sign-in failed"); }
    else {
      check("N1 non-admin token: GET /api/admin/faculty → 403", (await api("GET", "/api/admin/faculty", { token: nonAdmin.token })).status === 403);
      const p = await api("POST", "/api/admin/faculty", { token: nonAdmin.token, body: { id: "qa-p24-x", name: "x", designation: "x", sortOrder: 1 } });
      check("N2 non-admin token: POST /api/admin/faculty → 403 and nothing created", p.status === 403 && !(await byId("qa-p24-x")), p.status);
      const h = await api("POST", "/api/admin/hod", { token: nonAdmin.token, body: { facultyId: "qa-hod-a" } });
      check("N3 non-admin token: POST /api/admin/hod → 403", h.status === 403, h.status);
      const l = await api("POST", "/api/auth/login", { origin: BASE, body: { email: extra.QA_NONADMIN_EMAIL, password: extra.QA_NONADMIN_PASSWORD } });
      check("N4 non-admin browser sign-in is refused (401, generic) so the Faculty Manager is unreachable", l.status === 401 && l.json?.error === "Email or password is incorrect.", l.status);
      await nonAdmin.client.auth.signOut({ scope: "local" });
    }

    section("sign-in and list loading");
    await page.ev(`(() => { const set = (s, v) => { const el = document.querySelector(s); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); }; set("main input[type=email]", ${JSON.stringify(env.adminEmail)}); set("main input[type=password]", ${JSON.stringify(env.adminPassword)}); document.querySelector("main button[type=submit]").click(); return true; })()`);
    const loaded = await waitFor(`location.pathname === "/admin/faculty" && document.querySelectorAll("tbody tr").length > 0 && !!document.querySelector("table")`, 15000);
    check("L1 admin sign-in → /admin/faculty loads the backend table", !!loaded);
    const t = await bodyText();
    check("L2 T5 shell notice shown", t.includes(T5), t.slice(0, 400));
    const names = await tableNames();
    const facultyOnly = before.filter((f) => !f.id.startsWith("leadership-"));   // leadership profiles have their own table
    check("L3 faculty table rows = GET /api/admin/faculty without the leadership profiles, same order (sort_order, id)", JSON.stringify(names) === JSON.stringify(facultyOnly.map((f) => f.name)), { names, api: facultyOnly.map((f) => f.name) });
    check("L4 no demo-store faculty shown", STATIC_NAMES.every((n) => !t.includes(n)));
    check("L5 the browser fetched /api/admin/faculty", apiCalls("GET", /^\/api\/admin\/faculty$/) >= 1);
    const tokens = await page.ev(`({ cookie: document.cookie, storage: JSON.stringify(Object.assign({}, localStorage, sessionStorage)) })`);
    check("L6 no session token readable by page JavaScript", !/sb-/.test(tokens.cookie) && !/access_token|refresh_token/.test(tokens.storage));

    section("add dialog (F1–F5, T1) and client-side validation");
    await clickBtn("ADD FACULTY MEMBER"); await waitFor(`!!document.querySelector('[role=dialog]')`);
    let d = await dialog();
    check("D1 T1 description", d.description === T1, d.description);
    check("D2 Photo (upload) and Photo permission; F2–F4 Published, Active HOD, LinkedIn present", d.names.includes("image") && d.names.includes("imageConsent") && ["linkedin", "isPublished", "isActiveHod"].every((n) => d.names.includes(n)) && ["linkedin", "published", "active hod"].every((l) => d.labels.includes(l)), d.names);
    check("D3 F5 default department AI & DS; Published and Active HOD unticked", d.values.department === AIDS && d.values.isPublished === false && d.values.isActiveHod === false, d.values);
    await setField("name", "QA P24 Alpha"); await setField("id", "qa-p24-a"); await setField("designation", "QA Tester");
    await setCheck("isActiveHod", true);
    let posts = apiCalls("POST", /^\/api\/admin\/faculty$/);
    await submitDialog(); await sleep(300); d = await dialog();
    check("V1 Active HOD without Published → clear field error, nothing sent", d.fieldErrors.isActiveHod === HOD_RULE && apiCalls("POST", /^\/api\/admin\/faculty$/) === posts, d.fieldErrors);
    await setCheck("isActiveHod", false); await setField("linkedin", "http://example.com/x");
    await submitDialog(); await sleep(300); d = await dialog();
    check("V2 a non-https LinkedIn link → field error, nothing sent", d.fieldErrors.linkedin === "Enter a full https:// link." && apiCalls("POST", /^\/api\/admin\/faculty$/) === posts, d.fieldErrors);
    await setField("linkedin", ""); await setField("department", "");
    await submitDialog(); await sleep(300); d = await dialog();
    check("V3 an empty department → field error, nothing sent", d.fieldErrors.department === "Department is required." && apiCalls("POST", /^\/api\/admin\/faculty$/) === posts, d.fieldErrors);
    await setField("department", AIDS);

    section("create, update, delete");
    await submitDialog();
    await waitFor(`!document.querySelector('[role=dialog]')`);
    let a = await byId("qa-p24-a");
    check("C1 create: status line, row shown, stored unpublished, not HOD, AI & DS, no photo", (await statusText()) === `Faculty member "QA P24 Alpha" added.` && (await tableNames()).includes("QA P24 Alpha") && a && a.isPublished === false && a.isActiveHod === false && a.department === AIDS && a.image === "" && a.designation === "QA Tester", a);
    await clickBtn("Edit QA P24 Alpha"); await waitFor(`!!document.querySelector('[role=dialog]')`);
    d = await dialog();
    check("E0 edit dialog: T1, no ID field, stored values", lc(d.title) === "edit faculty member" && d.description === T1 && !d.names.includes("id") && d.values.designation === "QA Tester", d);
    await setField("designation", "QA Tester II"); await setField("linkedin", "https://www.linkedin.com/in/qa-p24"); await setField("quote", "QA quote.");
    await submitDialog(); await waitFor(`!document.querySelector('[role=dialog]')`);
    a = await byId("qa-p24-a");
    check("E1 update: designation, LinkedIn and quote stored; status line", a?.designation === "QA Tester II" && a?.linkedin === "https://www.linkedin.com/in/qa-p24" && a?.quote === "QA quote." && (await statusText()) === `Faculty member "QA P24 Alpha" saved.`, a);
    await clickBtn("Edit QA P24 Alpha"); await sleep(250);
    await setField("quote", ""); await setField("linkedin", "");
    await submitDialog(); await waitFor(`!document.querySelector('[role=dialog]')`);
    a = await byId("qa-p24-a");
    check("E2 clearing optional LinkedIn and quote clears them", a && a.linkedin === undefined && a.quote === undefined, a);

    section("HOD assignment and removal");
    if (!hodAllowed) for (const n of ["H1", "H2", "H3", "H4", "P1", "P2", "P3"]) notRun(`${n} HOD check`, "staging already has an active HOD");
    else {
      await clickBtn("Edit QA P24 Alpha"); await sleep(250);
      await setCheck("isPublished", true); await setCheck("isActiveHod", true);
      await submitDialog(); await waitFor(`!document.querySelector('[role=dialog]')`);
      a = await byId("qa-p24-a");
      const hods = (await list()).filter((f) => f.isActiveHod).map((f) => f.id);
      check("H1 Published + Active HOD → stored published and the only active HOD", a?.isPublished === true && a?.isActiveHod === true && JSON.stringify(hods) === '["qa-p24-a"]' && (await statusText()) === `Faculty member "QA P24 Alpha" saved.`, { a, hods });
      let deletes = apiCalls("DELETE", /^\/api\/admin\/faculty\//);
      await clickBtn("Delete QA P24 Alpha"); await sleep(250); d = await dialog();
      check("H2 deleting the active HOD is blocked in the dialog, nothing sent", lc(d.title) === "can't delete" && d.description === "The active HOD can't be deleted. Assign another HOD or clear the HOD first." && apiCalls("DELETE", /^\/api\/admin\/faculty\//) === deletes, d);
      await closeDialog();
      await clickBtn("Edit QA P24 Alpha"); await sleep(250);
      let patches = apiCalls("PATCH", /^\/api\/admin\/faculty\//);
      await setCheck("isPublished", false);
      await submitDialog(); await sleep(300); d = await dialog();
      check("H3 unpublishing while still the HOD → field error, nothing sent", d.fieldErrors.isActiveHod === HOD_RULE && apiCalls("PATCH", /^\/api\/admin\/faculty\//) === patches, d.fieldErrors);
      const mark = requests.length;
      await setCheck("isActiveHod", false);
      await submitDialog(); await waitFor(`!document.querySelector('[role=dialog]')`);
      a = await byId("qa-p24-a");
      const order = requests.slice(mark).filter((r) => r.url.startsWith(BASE + "/api/admin/") && r.method !== "GET").map((r) => `${r.method} ${new URL(r.url).pathname}`);
      check("H4 untick both → HOD cleared first, then unpublished; no active HOD left", a?.isActiveHod === false && a?.isPublished === false && JSON.stringify(order) === '["DELETE /api/admin/hod","PATCH /api/admin/faculty/qa-p24-a"]' && !(await list()).some((f) => f.isActiveHod), { a, order });

      section("partial success is reported, never shown as complete");
      intercept = { method: "POST", path: /^\/api\/admin\/hod$/, respond: { status: 500, body: { error: "Simulated HOD failure." } } };
      await clickBtn("Edit QA P24 Alpha"); await sleep(250);
      await setField("designation", "QA Tester III"); await setCheck("isPublished", true); await setCheck("isActiveHod", true);
      await submitDialog(); await waitFor(`!![...document.querySelectorAll('[role=dialog] [role=alert]')].length`);
      d = await dialog(); a = await byId("qa-p24-a");
      check("P1 update saved but HOD failed: dialog stays open with the exact partial message; stored state shown; no success line",
        d && d.alerts.includes("The changes were saved, but it was not made the active HOD: Simulated HOD failure.") && d.fieldErrors.isActiveHod === "Simulated HOD failure." && d.values.isActiveHod === false && d.values.isPublished === true
        && a?.designation === "QA Tester III" && a?.isPublished === true && a?.isActiveHod === false && (await statusText()) === "", { d, a });
      await closeDialog();
      await clickBtn("ADD FACULTY MEMBER"); await sleep(250);
      await setField("name", "QA P24 Beta"); await setField("id", "qa-p24-b"); await setField("designation", "QA Tester");
      await setCheck("isPublished", true); await setCheck("isActiveHod", true);
      await submitDialog(); await waitFor(`!![...document.querySelectorAll('[role=dialog] [role=alert]')].length`);
      d = await dialog(); const b = await byId("qa-p24-b");
      check("P2 create saved but HOD failed: exact partial message; the dialog turns into Edit for the stored record; no success line",
        d && d.alerts.includes("The faculty record was added, but it was not made the active HOD: Simulated HOD failure.") && lc(d.title) === "edit faculty member" && !d.names.includes("id")
        && b?.isPublished === true && b?.isActiveHod === false && (await statusText()) === "", { d, b });
      await setCheck("isActiveHod", true);
      await submitDialog(); await sleep(1200);
      d = await dialog();
      check("P3 HOD-only change that fails → 'Nothing was saved' (no partial claim)", d && d.alerts.includes("Nothing was saved: it was not made the active HOD: Simulated HOD failure.") && (await byId("qa-p24-b"))?.isActiveHod === false, d);
      intercept = null;
      await closeDialog();
      check("P4 no active HOD after the simulated failures", !(await list()).some((f) => f.isActiveHod));
    }

    section("server-side validation and refusals reach the form");
    await clickBtn("ADD FACULTY MEMBER"); await sleep(250);
    await setField("name", "QA P24 Gamma"); await setField("id", "qa-p24-c"); await setField("designation", "QA"); await setField("sortOrder", "2000000");
    await submitDialog(); await waitFor(`!![...document.querySelectorAll('[role=dialog] [role=alert]')].length`);
    d = await dialog();
    check("SV1 the server's field error (sortOrder) shows under the field with its form message; nothing created", d?.fieldErrors.sortOrder === "Enter a whole number from 0." && d?.alerts.includes("Please correct the highlighted fields.") && !(await byId("qa-p24-c")), d);
    await setField("name", "x".repeat(201)); await setField("sortOrder", "5");
    await submitDialog(); await sleep(1200); d = await dialog();
    check("SV2 an over-long name is refused by the server with a field message", d?.fieldErrors.name === "Keep this under 200 characters." && !(await byId("qa-p24-c")), d?.fieldErrors);
    await closeDialog();
    const historyId = ["qa-api-a", "qa-hod-a"].find((id) => messages.some((m) => m.facultyId === id) && others.some((f) => f.id === id));
    if (!historyId) notRun("SD1 delete refused for a record with message history", "no record with message history found (never deletes other data)");
    else {
      const rec = others.find((f) => f.id === historyId);
      await clickBtn(`Delete ${rec.name}`); await sleep(250); d = await dialog();
      check("SD0 T2 delete text", d?.description === `"${rec.name}" will be permanently deleted from the CMS.`, d?.description);
      await clickBtn("DELETE", "[role=dialog]"); await settle(); await waitFor(`!![...document.querySelectorAll('[role=dialog] [role=alert]')].length`);
      d = await dialog();
      check("SD1 the server's refusal (message history, 409) shows in the delete dialog; the record stays", d?.alerts.includes("This faculty member has HOD message history and can't be deleted.") && !!(await byId(historyId)), d);
      await closeDialog();
    }
    for (const [id, name] of [["qa-p24-a", "QA P24 Alpha"], ["qa-p24-b", "QA P24 Beta"]]) {
      if (!(await byId(id))) continue;
      await clickBtn(`Delete ${name}`); await sleep(250);
      await clickBtn("DELETE", "[role=dialog]"); await settle(); await waitFor(`!document.querySelector('[role=dialog]')`);
      check(`DL ${id}: deleted through the UI (status line, row gone, API 404 on re-delete)`, (await statusText()) === `Faculty member "${name}" deleted.` && !(await tableNames()).includes(name) && !(await byId(id)) && (await A("DELETE", `/api/admin/faculty/${id}`)).status === 404);
    }

    section("backend failures never fall back to demo data");
    const noFallback = async () => { const tx = await bodyText(); return !(await page.ev(`!!document.querySelector("table")`)) && !tx.includes("ADD FACULTY MEMBER") && STATIC_NAMES.every((n) => !tx.includes(n)); };
    for (const [id, respond, expected] of [
      ["NF1 503", { status: 503, body: { error: "The CMS backend is not configured." } }, "Couldn't load faculty records. The CMS backend is not configured."],
      ["NF2 500", { status: 500, body: { error: "Unexpected database error." } }, "Couldn't load faculty records. Unexpected database error."],
      ["NF3 401 (session ended)", { status: 401, body: { error: "Sign in required." } }, "Couldn't load faculty records. Sign in required."],
      ["NF4 network failure", "fail", "Couldn't load faculty records. Couldn't reach the server."],
      ["NF5 non-JSON 502", { status: 502, body: "<html>" }, "Couldn't load faculty records. Request failed (502)."],
    ]) {
      intercept = { method: "GET", path: /^\/api\/admin\/faculty$/, respond };
      await page.reload(800);
      const msg = await waitFor(`document.querySelector('main [role=alert]')?.innerText.trim()`, 8000);
      check(`${id} → error state '${expected}', no table, no demo data`, msg === expected && (await noFallback()), msg);
    }
    intercept = { method: "GET", path: /^\/api\/admin\/faculty$/, respond: { delay: 2500 } };
    await page.reload(300);
    const loading = await waitFor(`[...document.querySelectorAll('main p[role=status]')].map((p) => p.innerText.trim()).includes("Loading faculty…")`, 2000);
    check("NF6 a slow backend shows 'Loading faculty…' (no demo data meanwhile)", !!loading && (await noFallback()));
    intercept = null;
    check("NF7 the table returns once the backend answers", !!(await waitFor(`!!document.querySelector("table") && document.querySelectorAll("tbody tr").length > 0`, 10000)));

    section("Users stays demo-backed (Team, Events, Gallery: qa/cms-site); Overview T6");
    const mark2 = requests.length;
    for (const [path, singular] of [["/admin/users", "USER"]]) {
      await page.goto(BASE + path, 1500);
      const rows = await page.ev(`document.querySelectorAll("tbody tr").length`);
      const add = await page.ev(`(() => { const b = [...document.querySelectorAll("button")].find((x) => x.innerText.trim().startsWith("ADD ")); if (!b) return null; b.click(); return b.innerText.trim(); })()`);
      await sleep(300); d = await dialog();
      check(`O ${path}: demo table and demo dialog text unchanged (${add})`, rows > 0 && d?.description === DEMO_EDIT, { rows, add, desc: d?.description, singular });
      await closeDialog();
    }
    check("O5 the Users screen made no /api/admin request", requests.slice(mark2).filter((r) => r.url.startsWith(BASE + "/api/admin/")).length === 0);
    await page.goto(BASE + "/admin", 1500);
    await clickBtn("RESET DATA"); await sleep(250);
    check("O6 T6 reset confirmation", (await dialog())?.description === T6, (await dialog())?.description);
    await closeDialog();

    section("final state and transport");
    const after = await list();
    check("Z1 no qa-p24-* records left", !after.some((f) => f.id.startsWith("qa-p24-")), after.map((f) => f.id));
    check("Z2 the active HOD is unchanged from the start (none, or the owner's real HOD)", JSON.stringify(after.filter((f) => f.isActiveHod).map((f) => f.id)) === JSON.stringify(hodAtStart ? [hodAtStart.id] : []), after.filter((f) => f.isActiveHod).map((f) => f.id));
    check("Z3 existing staging records untouched (same fields and updatedAt)", JSON.stringify(after.filter((f) => !f.id.startsWith("qa-p24-"))) === JSON.stringify(others));
    check(`Z4 every /api response the browser saw was no-store (${apiNoStore.seen})`, apiNoStore.seen > 10 && apiNoStore.missing.length === 0, apiNoStore.missing.slice(0, 5));
    check("Z5 the browser never called Supabase directly (all through /api)", !requests.some((r) => /supabase\.co/.test(r.url)));
    check("Z6 no page exceptions", !page.errors.some((e) => e.startsWith("exception")), page.errors.slice(0, 5));
    await admin.client.auth.signOut({ scope: "local" });
  }
} catch (e) {
  check(`suite aborted: ${String(e.message || e).slice(0, 200)}`, false);
} finally {
  intercept = null;
  // safety net: remove only this suite's records and any HOD it set
  if (MODE === "backend") {
    try {
      const admin = await tokenFor(env.adminEmail, env.adminPassword);
      if (admin) {
        const rows = (await api("GET", "/api/admin/faculty", { token: admin.token })).json?.data ?? [];
        for (const f of rows.filter((x) => x.id.startsWith("qa-p24-"))) {
          if (f.isActiveHod) await api("DELETE", "/api/admin/hod", { token: admin.token });
          await api("DELETE", `/api/admin/faculty/${f.id}`, { token: admin.token });
          console.log(`cleanup: removed leftover ${f.id}`);
        }
        await admin.client.auth.signOut({ scope: "local" });
      }
    } catch {}
  }
  await page.close();
}

const failures = checks.filter((c) => !c.ok);
const result = { suite: "cms-faculty", mode: MODE, base: BASE, at: new Date().toISOString(), total: checks.length, passed: checks.length - failures.length, failures, checks };
const out = join(ROOT, "qa/cms-faculty/results"); mkdirSync(out, { recursive: true });
const file = join(out, `cms-faculty-${MODE}-${result.at.replace(/[:.]/g, "-")}.json`);
writeFileSync(file, scrub(JSON.stringify(result, null, 2)));
console.log(`\n${result.passed}/${result.total} passed (${MODE}) → ${file.slice(ROOT.length + 1)}`);
process.exit(failures.length || exitCode ? 1 : 0);
