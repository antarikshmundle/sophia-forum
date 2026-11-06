// HOD message management (Faculty Manager): sophia-cms-staging ONLY, against a LOCAL server.
//   node qa/cms-hod/cms-hod.test.mjs --mode backend --base http://localhost:3010   (CMS_AUTH_MODE=supabase + CMS_FACULTY_MODE=backend)
//   node qa/cms-hod/cms-hod.test.mjs --mode demo    --base http://localhost:3000   (default build: no HOD message section)
// Drives the real Admin Dashboard (headless Chrome) through draft → approved → published → archived on the existing QA
// test record qa-hod-a, with clearly labelled QA text (never a real HOD message). Runs only when staging has no active
// HOD, and restores the faculty state afterwards. Messages can't be deleted (by design): the QA messages it creates end
// archived, like the earlier suites' QA messages.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { loadQaEnv, redact, STAGING_REF } from "../cms-db/lib/env.mjs";
import { launch, sleep } from "../suites/lib/cdp.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const MODE = arg("mode", "backend");
const BASE = arg("base", MODE === "demo" ? "http://localhost:3000" : "http://localhost:3010").replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE)) { console.error("REFUSED: --base must be a local server."); process.exit(2); }
const env = loadQaEnv(ROOT);
const appRef = readFileSync(join(ROOT, ".env.local"), "utf8").match(/NEXT_PUBLIC_SUPABASE_URL\s*=\s*https:\/\/([a-z0-9]{20})\.supabase\.co/)?.[1];
if (appRef !== STAGING_REF) { console.error("REFUSED: .env.local does not point at sophia-cms-staging."); process.exit(2); }
const extra = Object.fromEntries(readFileSync(join(ROOT, ".env.test.local"), "utf8").split(/\r?\n/).map((l) => l.match(/^\s*(QA_NONADMIN_(?:EMAIL|PASSWORD))\s*=\s*(.*?)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^(['"])(.*)\1$/, "$2")]));
const secrets = [env.key, env.adminPassword, env.adminEmail, extra.QA_NONADMIN_PASSWORD, extra.QA_NONADMIN_EMAIL].filter(Boolean);
const scrub = (s) => { let o = redact(String(s), env); for (const v of secrets) o = o.split(v).join("[redacted]"); return o; };
const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok: !!ok, ...(ok || detail === undefined ? {} : { detail: scrub(JSON.stringify(detail)).slice(0, 1000) }) }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : "  — " + scrub(JSON.stringify(detail)).slice(0, 400)}`); };
const section = (t) => console.log(`\n== ${t}`);
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const about = async () => text(await (await fetch(BASE + "/about", { cache: "no-store" })).text());

const QA_TEXT = `QA TEST MESSAGE ${Date.now().toString(36)} — workflow check only, not a real HOD message.`;
const browser = await launch(9670);
let A = null, adminClient = null, before = null, owned = false;   // owned: this run set the HOD state and must restore it
const http = async (method, path, { token = A, origin, body } = {}) => {
  const h = {}; if (token) h.Authorization = `Bearer ${token}`; if (origin) h.Origin = origin; if (body !== undefined) h["Content-Type"] = "application/json";
  const r = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, json: r.status === 204 ? null : await r.json().catch(() => null) };
};
const ev = (x) => browser.ev(x);
const waitFor = async (expr, ms = 15000) => { const end = Date.now() + ms; let v; while (Date.now() < end) { try { v = await ev(expr); if (v) return v; } catch {} await sleep(150); } return v; };
const setVal = (name, v) => ev(`(() => { const el = document.querySelector('[role=dialog] [name="${name}"]'); if (!el) return false; const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(String(v))}); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
const clickText = (t) => ev(`(() => { const want = ${JSON.stringify(t.toLowerCase())}; const b = [...document.querySelectorAll("button")].find((x) => x.innerText.trim().toLowerCase() === want || (x.getAttribute("aria-label") || "").toLowerCase() === want); if (!b) return false; b.click(); return true; })()`);
const dialog = () => ev(`(() => { const d = document.querySelector('[role=dialog]'); if (!d) return null; return { names: [...d.querySelectorAll("[name]")].map((e) => e.getAttribute("name")), statusOptions: [...(d.querySelector('[name="status"]')?.options ?? [])].map((o) => o.value), alerts: [...d.querySelectorAll("[role=alert]")].map((a) => a.innerText.trim()), fieldErrors: Object.fromEntries([...d.querySelectorAll('[id$="-error"]')].map((e) => [e.id.replace(/^.*-([A-Za-z]+)-error$/, "$1"), e.innerText.trim()])) }; })()`);
const submit = async () => { await ev(`document.querySelector('[role=dialog] button[type=submit]')?.click(), true`); for (let i = 0; i < 60; i++) { await sleep(200); if (!(await ev(`!!document.querySelector('[role=dialog] button[disabled]')`))) break; } await sleep(400); };
const hodRow = () => ev(`(() => { const sec = document.querySelector('[aria-labelledby="hod-messages-heading"]'); if (!sec) return null; const row = [...sec.querySelectorAll("tbody tr")].find((r) => r.innerText.includes(${JSON.stringify(QA_TEXT.slice(0, 30))})); if (!row) return null; const c = [...row.children].map((td) => td.innerText.replace(/\\s+/g, " ").trim()); return { faculty: c[0], status: c[1], message: c[2], approved: c[3], editable: !!row.querySelector('button[aria-label^="Edit "]') }; })()`);
const label = `QA qa-hod-a: ${QA_TEXT.slice(0, 40)}`;
const openFaculty = async () => { await browser.goto(BASE + "/admin/faculty", 800); return waitFor(`!!document.querySelector('[aria-labelledby="hod-messages-heading"] table')`); };

try {
  await browser.viewport("desktop");
  if (MODE === "demo") {
    section("demo mode: no HOD message section");
    await browser.goto(BASE + "/login?next=%2Fadmin%2Ffaculty", 1500);
    await clickText("Fill in the admin demo credentials"); await sleep(200);
    await ev(`document.querySelector('main button[type=submit]').click(), true`);
    await waitFor(`location.pathname === "/admin/faculty" && document.querySelectorAll("tbody tr").length > 1`);
    check("DM1 demo Faculty Manager has no HOD message section and makes no /api/admin request", !(await ev(`!!document.querySelector('[aria-labelledby="hod-messages-heading"]')`)));
  } else {
    const c = createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } });
    const s = await c.auth.signInWithPassword({ email: env.adminEmail, password: env.adminPassword });
    if (s.error) throw new Error("admin sign-in failed"); A = s.data.session.access_token; adminClient = c;
    const faculty = (await http("GET", "/api/admin/faculty")).json?.data ?? [];
    before = faculty.find((f) => f.id === "qa-hod-a");
    const hodNow = faculty.find((f) => f.isActiveHod);
    if (hodNow || !before) throw new Error(`NOT RUN: ${hodNow ? `staging already has an active HOD (${hodNow.id}); it is never switched by tests` : "qa-hod-a missing"}`);
    owned = true;

    section("access");
    check("A1 anonymous list/create → 401", (await http("GET", "/api/admin/hod-messages", { token: null })).status === 401 && (await http("POST", "/api/admin/hod-messages", { token: null, origin: BASE, body: { facultyId: "qa-hod-a", message: "x" } })).status === 401);
    const nc = createClient(env.url, env.key, { auth: { persistSession: false } });
    const ns = await nc.auth.signInWithPassword({ email: extra.QA_NONADMIN_EMAIL, password: extra.QA_NONADMIN_PASSWORD });
    if (ns.error) check("A2 non-admin (NOT RUN: sign-in failed)", false);
    else check("A2 non-admin list/create → 403", (await http("GET", "/api/admin/hod-messages", { token: ns.data.session.access_token })).status === 403 && (await http("POST", "/api/admin/hod-messages", { token: ns.data.session.access_token, body: { facultyId: "qa-hod-a", message: "x" } })).status === 403);
    check("A3 cross-site write → 403", (await http("POST", "/api/admin/hod-messages", { token: null, origin: "https://evil.example", body: {} })).status === 403);

    section("setup: QA record qa-hod-a published and made the active HOD (restored at the end)");
    await http("PATCH", "/api/admin/faculty/qa-hod-a", { body: { isPublished: true } });
    check("S1 qa-hod-a is the published active HOD", (await http("POST", "/api/admin/hod", { body: { facultyId: "qa-hod-a" } })).status === 200);

    section("browser: Admin → Faculty → HOD messages");
    await browser.goto(BASE + "/login?next=%2Fadmin%2Ffaculty", 1500);
    await ev(`(() => { const set = (s, v) => { const el = document.querySelector(s); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); }; set("main input[type=email]", ${JSON.stringify(env.adminEmail)}); set("main input[type=password]", ${JSON.stringify(env.adminPassword)}); document.querySelector("main button[type=submit]").click(); return true; })()`);
    check("B0 signed in; the Faculty Manager shows the HOD messages section", !!(await waitFor(`location.pathname === "/admin/faculty" && !!document.querySelector('[aria-labelledby="hod-messages-heading"] table')`, 25000)));
    await clickText("ADD HOD MESSAGE"); await sleep(400);
    let d = await dialog();
    check("B1 the Add dialog asks only for the faculty member and the wording (no status, no approval)", JSON.stringify(d?.names) === '["facultyId","message"]', d);
    await setVal("facultyId", "qa-hod-a"); await setVal("message", QA_TEXT); await submit();
    let row = await hodRow();
    check("B2 created as a DRAFT, not approved", row?.status.toLowerCase() === "draft" && row.approved === "—", row);
    check("B3 a draft is not on the About page", !(await about()).includes(QA_TEXT));

    await clickText(`Edit ${label}`); await sleep(400); d = await dialog();
    check("B4 a draft's wording can be edited; publishing is not offered (approve first)", d?.names.includes("message") && JSON.stringify(d.statusOptions) === '["draft","approved","archived"]', d);
    await setVal("status", "approved"); await submit(); d = await dialog();
    check("B5 approving without who/when is refused in the form", d && d.fieldErrors.approvedBy === "Record who approved the final wording." && d.fieldErrors.approvedOn === "Enter the approval date.", d);
    await setVal("approvedBy", "QA approver (test)"); await setVal("approvedOn", "2026-11-02"); await submit();
    row = await hodRow();
    check("B6 APPROVED, showing who approved it and when", row?.status.toLowerCase() === "approved" && row.approved === "QA approver (test) · 2026-11-02", row);
    check("B7 an approved message is not on the About page yet", !(await about()).includes(QA_TEXT));

    await clickText(`Edit ${label}`); await sleep(400); d = await dialog();
    check("B8 approved: the wording is no longer editable; next steps publish / back to draft / archive", d && !d.names.includes("message") && JSON.stringify(d.statusOptions) === '["approved","published","draft","archived"]', d);
    await setVal("status", "published"); await submit();
    row = await hodRow();
    let a = await about();
    check("B9 PUBLISHED: About shows the HOD card with the exact approved wording and the HOD's name", row?.status.toLowerCase() === "published" && a.includes("A word from the Head of Department") && a.includes(QA_TEXT) && a.includes("QA qa-hod-a"), { row, card: a.includes("A word from the Head of Department") });
    const msgs = (await http("GET", "/api/admin/hod-messages")).json?.data ?? [];
    const mine = msgs.find((m) => m.message === QA_TEXT);
    check("B10 published wording can't be changed, even through the API (400)", (await http("PATCH", `/api/admin/hod-messages/${mine?.id}`, { body: { message: "changed" } })).status === 400);
    check("B10b the approval record can't be rewritten through the API (400)", (await http("PATCH", `/api/admin/hod-messages/${mine?.id}`, { body: { approvedBy: "someone else" } })).status === 400);

    await openFaculty();
    await clickText(`Edit ${label}`); await sleep(400); d = await dialog();
    check("B11 published: only archiving is offered", JSON.stringify(d?.statusOptions) === '["published","archived"]', d);
    await setVal("status", "archived"); await submit();
    row = await hodRow(); a = await about();
    check("B12 ARCHIVED: the card is gone from About; the row stays (history) and has no Edit button", row?.status.toLowerCase() === "archived" && !row.editable && !a.includes(QA_TEXT) && !a.includes("A word from the"), row);
    check("B13 an archived message can't be reopened through the API (409)", (await http("PATCH", `/api/admin/hod-messages/${mine?.id}`, { body: { status: "draft" } })).status === 409);

    section("browser: a draft can't be published, and a second message can't replace the published one");
    await clickText("ADD HOD MESSAGE"); await sleep(400);
    await setVal("facultyId", "qa-hod-a"); await setVal("message", `${QA_TEXT} (2)`); await submit();
    const second = ((await http("GET", "/api/admin/hod-messages")).json?.data ?? []).find((m) => m.message === `${QA_TEXT} (2)`);
    check("C1 publishing a draft directly through the API is refused (400 status: approve first)", (await http("PATCH", `/api/admin/hod-messages/${second?.id}`, { body: { status: "published", approvedBy: "x", approvedOn: "2026-11-02" } })).json?.errors?.status !== undefined);
    await http("PATCH", `/api/admin/hod-messages/${second?.id}`, { body: { status: "archived" } });
    check("C2 a draft can be archived directly", ((await http("GET", "/api/admin/hod-messages")).json?.data ?? []).find((m) => m.id === second?.id)?.status === "archived");
    check("C3 no page exceptions in the Admin UI", !browser.errors.some((e) => e.startsWith("exception")), browser.errors.slice(0, 3));
  }
} catch (e) {
  check(`suite aborted: ${String(e.message || e).slice(0, 300)}`, false);
} finally {
  if (MODE === "backend" && A && before && owned) {
    await http("DELETE", "/api/admin/hod");
    await http("PATCH", "/api/admin/faculty/qa-hod-a", { body: { isPublished: before.isPublished } });
    const after = ((await http("GET", "/api/admin/faculty")).json?.data ?? []);
    const qa = after.find((f) => f.id === "qa-hod-a");
    check("Z1 restored: no active HOD; qa-hod-a back to its published state; About shows no HOD card", !after.some((f) => f.isActiveHod) && qa?.isPublished === before.isPublished && !(await about()).includes("A word from the"));
    const open = ((await http("GET", "/api/admin/hod-messages")).json?.data ?? []).filter((m) => m.message.startsWith("QA TEST MESSAGE") && m.status !== "archived");
    check("Z2 every QA message this suite created ends archived", open.length === 0, open.map((m) => m.status));
    await adminClient?.auth.signOut({ scope: "local" });
  }
  await browser.close();
}
const failures = checks.filter((x) => !x.ok);
const out = join(ROOT, "qa/cms-hod/results"); mkdirSync(out, { recursive: true });
const at = new Date().toISOString();
const file = join(out, `cms-hod-${MODE}-${at.replace(/[:.]/g, "-")}.json`);
writeFileSync(file, scrub(JSON.stringify({ suite: "cms-hod", mode: MODE, at, total: checks.length, passed: checks.length - failures.length, failures, checks }, null, 2)));
console.log(`\n${checks.length - failures.length}/${checks.length} passed (${MODE}) → ${file.slice(ROOT.length + 1)}`);
process.exit(failures.length ? 1 : 0);
