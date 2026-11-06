// Admin → public tests for Team, Events, Gallery and Content (migration 7b): sophia-cms-staging ONLY, LOCAL server.
//   node qa/cms-site/cms-site.test.mjs --mode backend --base http://localhost:3010   (built + started with CMS_AUTH_MODE=supabase
//                                                                                     and CMS_FACULTY_MODE=backend)
//   node qa/cms-site/cms-site.test.mjs --mode error   --base http://localhost:3011   (backend mode, Supabase unreachable)
//   node qa/cms-site/cms-site.test.mjs --mode demo    --base http://localhost:3000   (default build)
// Records are created through the real Admin UI (headless Chrome, throw-away profile) and checked on the public
// pages. Only qa-site-* records are created; all are deleted at the end. Content sections the suite edits are put
// back to the built-in text (the same text the site shows when a section was never edited).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { rmSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { loadQaEnv, redact, STAGING_REF } from "../cms-db/lib/env.mjs";
import { launch, sleep } from "../suites/lib/cdp.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const MODE = arg("mode", "backend");
const BASE = arg("base", MODE === "demo" ? "http://localhost:3000" : MODE === "error" ? "http://localhost:3011" : "http://localhost:3010").replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE)) { console.error("REFUSED: --base must be a local server."); process.exit(2); }
const env = loadQaEnv(ROOT);
const appRef = readFileSync(join(ROOT, ".env.local"), "utf8").match(/NEXT_PUBLIC_SUPABASE_URL\s*=\s*https:\/\/([a-z0-9]{20})\.supabase\.co/)?.[1];
if (appRef !== STAGING_REF) { console.error("REFUSED: .env.local does not point at sophia-cms-staging."); process.exit(2); }
const extra = Object.fromEntries(readFileSync(join(ROOT, ".env.test.local"), "utf8").split(/\r?\n/).map((l) => l.match(/^\s*(QA_NONADMIN_(?:EMAIL|PASSWORD))\s*=\s*(.*?)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^(['"])(.*)\1$/, "$2")]));
const secrets = [env.key, env.adminPassword, env.adminEmail, extra.QA_NONADMIN_PASSWORD, extra.QA_NONADMIN_EMAIL].filter(Boolean);
const scrub = (s) => { let o = redact(String(s), env); for (const v of secrets) o = o.split(v).join("[redacted]"); return o; };
const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok: !!ok, ...(ok || detail === undefined ? {} : { detail: scrub(JSON.stringify(detail)).slice(0, 1200) }) }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : "  — " + scrub(JSON.stringify(detail)).slice(0, 400)}`); };
const section = (t) => console.log(`\n== ${t}`);

// the built-in section text (src/data/siteContent.ts), used to put edited sections back exactly
const SITE = await (async () => {
  const req = createRequire(join(ROOT, "package.json")); const ts = req("typescript");
  const dir = join(tmpdir(), `cms-site-${Date.now()}`); mkdirSync(dir, { recursive: true });
  try {
    writeFileSync(join(dir, "siteContent.mjs"), ts.transpileModule(readFileSync(join(ROOT, "src/data/siteContent.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
    return await import(pathToFileURL(join(dir, "siteContent.mjs")).href);
  } finally { rmSync(dir, { recursive: true, force: true }); }
})();
const RESTORE = {
  ...Object.fromEntries(SITE.CONTENT_SECTIONS.map((sec) => [sec.id, sec.defaults])),
  "about.milestones": { items: SITE.DEFAULT_MILESTONES },
};

const T1 = "Saved to the Sophia Forum CMS.";
const DEMO_EDIT = "Mock data — saved only in this browser.";
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const get = async (path) => { const r = await fetch(BASE + path, { cache: "no-store", redirect: "manual" }); return { status: r.status, html: await r.text() }; };
const STATIC = {
  team: [...readFileSync(join(ROOT, "src/data/staticTeam.ts"), "utf8").matchAll(/^\s+name: "([^"]+)"/gm)].map((m) => m[1]).slice(0, 5),
  events: [...readFileSync(join(ROOT, "src/data/staticEvents.ts"), "utf8").matchAll(/^\s+name: "([^"]+)"/gm)].map((m) => m[1]),
};

// ---------------------------------------------------------------- error mode: public pages with the backend unreachable
if (MODE === "error") {
  for (const [path, msg] of [["/team", "Team profiles are temporarily unavailable."], ["/events", "Events are temporarily unavailable."], ["/gallery", "The gallery is temporarily unavailable."], ["/team/any-member", "This profile is temporarily unavailable."], ["/events/any-event", "This event is temporarily unavailable."]]) {
    const r = await get(path); const t = text(r.html);
    check(`X ${path}: error state "${msg}", no built-in records`, r.status === 200 && t.includes(msg) && STATIC.team.every((n) => !t.includes(n)) && STATIC.events.every((n) => !t.includes(n)), { status: r.status, sample: t.slice(0, 200) });
  }
  const home = text((await get("/")).html);
  check("X home: renders; upcoming, video and gallery sections are not shown; no built-in events", home.includes("SOPHIA") && !home.includes("WHAT'S NEXT") && !home.includes("GALLERY HIGHLIGHTS") && STATIC.events.every((n) => !home.includes(n)));
  check("X home and About keep their own page text (built-in copy) when the content read fails", home.includes("MORE THAN A CLUB.") && text((await get("/about")).html).includes("ABOUT SOPHIA FORUM"));
  finish();
}

// ---------------------------------------------------------------- browser helpers
const page = await launch(9640);
const requests = [];
const inflight = new Set();
page.on("Network.requestWillBeSent", (p) => { requests.push({ method: p.request.method, url: p.request.url }); if (p.request.url.startsWith(BASE + "/api/")) inflight.add(p.requestId); });
page.on("Network.loadingFinished", (p) => inflight.delete(p.requestId));
page.on("Network.loadingFailed", (p) => inflight.delete(p.requestId));
async function settle(ms = 15000) {
  await sleep(200); const end = Date.now() + ms; let quiet = inflight.size ? 0 : Date.now();
  while (Date.now() < end) { if (inflight.size) quiet = 0; else if (!quiet) quiet = Date.now(); if (quiet && Date.now() - quiet > 500 && !(await page.ev(`!!document.querySelector('button[disabled]')`))) return; await sleep(100); }
}
const waitFor = async (expr, ms = 12000) => { const end = Date.now() + ms; let v; while (Date.now() < end) { try { v = await page.ev(expr); if (v) return v; } catch {} await sleep(150); } return v; };
const setField = (name, value) => page.ev(`(() => { const el = document.querySelector('[role=dialog] [name="${name}"]'); if (!el) return false; const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(String(value))}); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
const setCheck = (name, on) => page.ev(`(() => { const el = document.querySelector('[role=dialog] [name="${name}"]'); if (!el) return false; if (el.checked !== ${on}) el.click(); return el.checked === ${on}; })()`);
const clickBtn = (label, scope = "") => page.ev(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(scope + " button")})].find((x) => x.innerText.trim() === ${JSON.stringify(label)} || x.getAttribute("aria-label") === ${JSON.stringify(label)}); if (!b) return false; b.click(); return true; })()`);
const submit = async () => { await page.ev(`document.querySelector('[role=dialog] button[type=submit]')?.click(), true`); await settle(); };
const dialog = () => page.ev(`(() => { const d = document.querySelector('[role=dialog]'); if (!d) return null; const desc = d.getAttribute("aria-describedby"); return { title: (d.querySelector("h2")?.innerText ?? "").trim(), description: desc ? (document.getElementById(desc)?.innerText ?? "").trim() : "", alerts: [...d.querySelectorAll("[role=alert]")].map((a) => a.innerText.trim()), fieldErrors: Object.fromEntries([...d.querySelectorAll('[id$="-error"]')].map((e) => [e.id.replace(/^.*-([A-Za-z0-9]+)-error$/, "$1"), e.innerText.trim()])), names: [...d.querySelectorAll("[name]")].map((e) => e.getAttribute("name")) }; })()`);
const statusText = () => page.ev(`[...document.querySelectorAll('p[role=status][aria-live=polite]')].map((p) => p.innerText.trim()).filter(Boolean).join(" | ")`);
const rowsText = () => page.ev(`[...document.querySelectorAll("tbody tr")].map((r) => r.innerText.replace(/\\s+/g, " ").trim())`);
const closeDialog = async () => { await clickBtn("CANCEL", "[role=dialog]") || await clickBtn("OK", "[role=dialog]"); await waitFor(`!document.querySelector('[role=dialog]')`, 4000); };
const open = async (path, ready = `!!document.querySelector("table")`) => { await page.goto(BASE + path, 800); return waitFor(ready, 15000); };

let A = null, adminClient = null;
async function api(method, path, { token, body, origin } = {}) {
  const h = {}; if (token) h.Authorization = `Bearer ${token}`; if (origin) h.Origin = origin; if (body !== undefined) h["Content-Type"] = "application/json";
  const r = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, json: r.status === 204 ? null : await r.json().catch(() => null) };
}
const adminApi = (method, path, body) => api(method, path, { token: A, body });
async function cleanup() {
  if (!A) return;
  for (const name of ["team", "events", "gallery"]) {
    const rows = (await adminApi("GET", `/api/admin/${name}`)).json?.data ?? [];
    for (const r of rows.filter((x) => String(x.id).startsWith("qa-site-"))) await adminApi("DELETE", `/api/admin/${name}/${r.id}`);
  }
}

try {
  await page.viewport("desktop");
  if (MODE === "demo") {
    section("demo mode: Team, Events, Gallery still demo; no Content tab; public pages unchanged");
    await page.goto(BASE + "/login?next=%2Fadmin%2Fteam", 1500);
    await clickBtn("Fill in the admin demo credentials"); await sleep(200);
    await page.ev(`document.querySelector('main button[type=submit]').click(), true`);
    await waitFor(`location.pathname === "/admin/team" && document.querySelectorAll("tbody tr").length > 1`);
    for (const p of ["/admin/team", "/admin/events", "/admin/gallery"]) {
      await open(p, `document.querySelectorAll("tbody tr").length > 1`);
      await page.ev(`[...document.querySelectorAll("button")].find((x) => x.innerText.trim().startsWith("ADD "))?.click(), true`); await sleep(300);
      const d = await dialog();
      check(`DM ${p}: demo dialog text, no Published field`, d?.description === DEMO_EDIT && !d.names.includes("isPublished"), d);
      await closeDialog();
    }
    check("DM no Content tab in demo mode", !(await page.ev(`[...document.querySelectorAll("a")].some((a) => a.getAttribute("href") === "/admin/content")`)));
    await open("/admin/content", `!!document.querySelector('main p[role=status]')`);
    check("DM /admin/content explains it needs the CMS backend", (await page.ev(`document.querySelector('main p[role=status]')?.innerText ?? ""`)).includes("available when the dashboard runs on the CMS backend"));
    check("DM no /api/admin request in demo mode", !requests.some((r) => r.url.startsWith(BASE + "/api/admin/")));
    const team = text((await get("/team")).html), events = text((await get("/events")).html);
    check("DM public /team and /events still show the built-in records", STATIC.team.some((n) => team.includes(n)) && STATIC.events.some((n) => events.includes(n)));
  } else {
    // ---------------------------------------------------------------- backend mode
    const c = createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } });
    const s = await c.auth.signInWithPassword({ email: env.adminEmail, password: env.adminPassword });
    if (s.error) throw new Error("admin sign-in failed"); A = s.data.session.access_token; adminClient = c;
    await cleanup();
    const contentBefore = (await adminApi("GET", "/api/admin/content")).json?.data ?? {};

    section("access");
    for (const p of ["/api/admin/team", "/api/admin/events", "/api/admin/gallery", "/api/admin/content"]) check(`A ${p} without a session → 401`, (await api("GET", p)).status === 401);
    check("A PUT content without a session → 401", (await api("PUT", "/api/admin/content/home.hero", { origin: BASE, body: { data: { badge: "x" } } })).status === 401);
    const na = extra.QA_NONADMIN_EMAIL ? await createClient(env.url, env.key, { auth: { persistSession: false } }).auth.signInWithPassword({ email: extra.QA_NONADMIN_EMAIL, password: extra.QA_NONADMIN_PASSWORD }) : null;
    if (na?.data?.session) {
      const t = na.data.session.access_token;
      check("A non-admin token: team list and create → 403", (await api("GET", "/api/admin/team", { token: t })).status === 403 && (await api("POST", "/api/admin/team", { token: t, body: { id: "qa-site-x", name: "x", role: "x", category: "Technical Team", sortOrder: 1 } })).status === 403);
      check("A non-admin token: content save → 403", (await api("PUT", "/api/admin/content/home.hero", { token: t, body: { data: { badge: "x" } } })).status === 403);
    } else check("A non-admin checks (NOT RUN: non-admin sign-in failed)", false);
    check("A cross-site write refused (403)", (await api("POST", "/api/admin/events", { origin: "https://evil.example", body: {} })).status === 403);

    section("API validation");
    const bad = await adminApi("POST", "/api/admin/team", { id: "qa-site-bad", name: "x", role: "x", category: "Chess", sortOrder: 1, photo: "https://images.example.com/x.webp", hacker: 1 });
    check("V team: unknown committee, third-party image host and unknown field → 400 with field errors", bad.status === 400 && bad.json?.errors?.category && bad.json?.errors?.photo && bad.json?.errors?.hacker, bad.json);
    const badEv = await adminApi("POST", "/api/admin/events", { id: "qa-site-bad", name: "x", date: "2026-02-30", venue: "x", status: "past", description: "x", poster: "/images/x.jpg", isFeatured: true });
    check("V events: an invalid calendar date → 400 (date)", badEv.status === 400 && !!badEv.json?.errors?.date, badEv.json);
    const badEv2 = await adminApi("POST", "/api/admin/events", { id: "qa-site-bad", name: "x", date: "2026-12-01", venue: "x", status: "past", description: "x", poster: "/images/x.jpg", isFeatured: true });
    check("V events: featured while not upcoming → 400 (isFeatured)", badEv2.status === 400 && !!badEv2.json?.errors?.isFeatured, badEv2.json);
    const badG = await adminApi("POST", "/api/admin/gallery", { id: "qa-site-bad", title: "x", category: "video", event: "General", year: 2026, url: "https://example.com/v.mp4" });
    check("V gallery: a non-YouTube video → 400 (url)", badG.status === 400 && badG.json?.errors?.url, badG.json);
    const badC = await adminApi("PUT", "/api/admin/content/home.hero", { data: { badge: "", stat1Value: "lots", unknown: "x" } });
    check("V content: required text, number type and unknown keys → 400", badC.status === 400 && badC.json?.errors?.badge && badC.json?.errors?.stat1Value && badC.json?.errors?.unknown, badC.json);
    check("V content: unknown section → 404", (await adminApi("PUT", "/api/admin/content/home.secret", { data: {} })).status === 404);
    check("V PATCH a missing record → 404", (await adminApi("PATCH", "/api/admin/team/qa-site-none", { name: "x" })).status === 404);

    section("sign in to Admin");
    await page.goto(BASE + "/login?next=%2Fadmin%2Fteam", 1500);
    await page.ev(`(() => { const set = (s, v) => { const el = document.querySelector(s); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); }; set("main input[type=email]", ${JSON.stringify(env.adminEmail)}); set("main input[type=password]", ${JSON.stringify(env.adminPassword)}); document.querySelector("main button[type=submit]").click(); return true; })()`);
    check("S1 admin reaches /admin/team (backend table)", !!(await waitFor(`location.pathname === "/admin/team" && !!document.querySelector("table")`, 20000)));
    check("S2 Content tab is shown in backend mode", await page.ev(`[...document.querySelectorAll("a")].some((a) => a.getAttribute("href") === "/admin/content")`));

    // ---------------- Team
    section("Team: Admin → /team and /team/[id]");
    await clickBtn("ADD MEMBER"); await sleep(300);
    let d = await dialog();
    check("T0 add dialog: CMS text and the Published field", d?.description === T1 && d.names.includes("isPublished"), d);
    await setField("name", "QA Site Member"); await setField("id", "qa-site-m1"); await setField("role", "QA Role"); await setField("category", "Technical Team");
    await setField("bio", "QA site bio."); await setField("skills", "Testing, QA"); await setField("photo", "https://images.example.com/x.webp"); await setCheck("isPublished", true);
    await submit(); d = await dialog();
    check("T1 a third-party (ImageKit) photo is refused by the server with a field message", d?.fieldErrors.photo === "Upload a photo, or use a site image path (/images/…) or a YouTube thumbnail URL.", d);
    await setField("photo", "/logo192.png"); await submit();
    check("T2 member saved through the dialog", (await statusText()).includes(`Member "QA Site Member" added.`) && !(await dialog()), await statusText());
    let t = text((await get("/team")).html);
    check("T3 /team shows the published member, and no built-in members", t.includes("QA Site Member") && STATIC.team.every((n) => !t.includes(n)), t.slice(0, 300));
    let det = await get("/team/qa-site-m1");
    check("T4 /team/qa-site-m1 shows role, bio and skills", det.status === 200 && text(det.html).includes("QA Role") && text(det.html).includes("QA site bio.") && text(det.html).includes("Testing"), det.status);
    await clickBtn("ADD MEMBER"); await sleep(300);
    await setField("name", "QA Site Draft"); await setField("id", "qa-site-m2"); await setField("role", "Draft"); await submit();
    t = text((await get("/team")).html);
    check("T5 an unpublished member is not listed and its page is 404", !t.includes("QA Site Draft") && (await get("/team/qa-site-m2")).status === 404);
    await clickBtn("Edit QA Site Member"); await sleep(300); await setField("role", "QA Lead"); await submit();
    check("T6 edit in Admin → the profile shows the new role on the next request", text((await get("/team/qa-site-m1")).html).includes("QA Lead"));
    await clickBtn("Delete QA Site Member"); await sleep(300);
    d = await dialog(); check("T7 delete dialog uses the CMS text", d?.description === `"QA Site Member" will be permanently deleted from the CMS.`, d);
    await clickBtn("DELETE", "[role=dialog]"); await settle();
    check("T8 deleted in Admin → /team/qa-site-m1 is 404 and gone from /team", (await get("/team/qa-site-m1")).status === 404 && !text((await get("/team")).html).includes("QA Site Member"));

    // ---------------- Events
    section("Events: Admin → /events, /events/[id], home Upcoming");
    await open("/admin/events");
    await clickBtn("ADD EVENT"); await sleep(300);
    await setField("name", "QA Site Event"); await setField("id", "qa-site-e1"); await setField("date", "2026-12-15"); await setField("time", "10:00 AM");
    await setField("venue", "QA Hall"); await setField("status", "upcoming"); await setField("description", "QA event description."); await setField("poster", "/logo192.png");
    await setCheck("isFeatured", true); await setCheck("isPublished", true); await submit();
    check("E1 event saved through the dialog", (await statusText()).includes(`Event "QA Site Event" added.`), await statusText());
    t = text((await get("/events")).html);
    check("E2 /events shows it (featured), and no built-in events", t.includes("QA Site Event") && STATIC.events.every((n) => !t.includes(n)));
    det = await get("/events/qa-site-e1");
    check("E3 /events/qa-site-e1 shows date, time, venue, description and UPCOMING", det.status === 200 && ["2026-12-15", "10:00 AM", "QA Hall", "QA event description.", "UPCOMING"].every((x) => text(det.html).includes(x)));
    check("E4 home 'What's next' shows the upcoming event", text((await get("/")).html).includes("QA Site Event"));
    await clickBtn("Status: upcoming. Toggle status of QA Site Event"); await settle();
    const ev = (await adminApi("GET", "/api/admin/events")).json.data.find((e) => e.id === "qa-site-e1");
    check("E5 the inline status toggle saves (completed, no longer featured)", ev?.status === "completed" && ev?.isFeatured === false && (await statusText()).includes(`Event "QA Site Event" saved.`), ev);
    check("E6 → public page shows COMPLETED; home no longer shows it", text((await get("/events/qa-site-e1")).html).includes("COMPLETED") && !text((await get("/")).html).includes("QA Site Event"));
    await clickBtn("Delete QA Site Event"); await sleep(300); await clickBtn("DELETE", "[role=dialog]"); await settle();
    check("E7 deleted in Admin → /events/qa-site-e1 is 404", (await get("/events/qa-site-e1")).status === 404);

    // ---------------- Gallery
    section("Gallery: Admin → /gallery and home previews");
    await open("/admin/gallery");
    await clickBtn("ADD MEDIA ITEM"); await sleep(300);
    await setField("title", "QA Site Photo"); await setField("id", "qa-site-g1"); await setField("category", "photo"); await setField("event", "General"); await setField("year", "2026");
    await setField("url", "/logo192.png"); await setCheck("isFeatured", true); await setCheck("isPublished", true); await submit();
    await clickBtn("ADD MEDIA ITEM"); await sleep(300);
    await setField("title", "QA Site Video"); await setField("id", "qa-site-g2"); await setField("category", "video"); await setField("event", "General"); await setField("year", "2026");
    await setField("url", "https://www.youtube.com/watch?v=LTCbZGLpdE0"); await setCheck("isPublished", true); await submit();
    const rows = await rowsText();
    check("G1 photo and video saved", rows.some((r) => r.includes("QA Site Photo")) && rows.some((r) => r.includes("QA Site Video")), rows);
    const g = await get("/gallery"), homeHtml = (await get("/")).html;
    check("G2 /gallery serves the published photo and video", g.status === 200 && g.html.includes("QA Site Photo") && g.html.includes("QA Site Video"));
    // (titles appear in the cards' alt / aria-label attributes, so the raw HTML is checked)
    check("G3 home shows the featured photo in Gallery highlights and the video in the video section", text(homeHtml).includes("GALLERY HIGHLIGHTS") && homeHtml.includes("QA Site Photo") && homeHtml.includes("QA Site Video"));
    await page.ev(`document.querySelector('input[aria-label="Featured: QA Site Photo"]')?.click(), true`); await settle();
    check("G4 the inline Featured toggle saves → highlights section hidden (no featured photo)", !text((await get("/")).html).includes("GALLERY HIGHLIGHTS"));
    for (const title of ["QA Site Photo", "QA Site Video"]) { await clickBtn(`Delete ${title}`); await sleep(300); await clickBtn("DELETE", "[role=dialog]"); await settle(); }
    check("G5 deleted in Admin → gone from /gallery", !(await get("/gallery")).html.includes("QA Site Photo"));

    // ---------------- Content
    section("Content: Admin → home and About text, milestones");
    await page.goto(BASE + "/admin/content", 800);
    check("C0 Content tab lists the page sections", !!(await waitFor(`document.querySelectorAll("tbody tr").length >= 8`, 15000)));
    await clickBtn("Edit Home · Hero"); await sleep(300);
    d = await dialog(); check("C1 the hero form has its own fields", ["badge", "title1", "title2", "stat1Value", "stat4Label"].every((n) => d?.names.includes(n)), d?.names);
    await setField("badge", ""); await submit(); d = await dialog();
    check("C2 a required text left empty is refused in the form", d?.fieldErrors.badge === "Badge is required.", d?.fieldErrors);
    await setField("badge", "QA SITE BADGE"); await setField("stat1Value", "42"); await submit();
    let h = text((await get("/")).html);
    check("C3 home hero shows the edited badge and figure on the next request", h.includes("QA SITE BADGE") && h.includes("42+"));
    await clickBtn("Edit About · Mission, Vision, Objectives"); await sleep(300); await setField("body1", "QA site mission text."); await submit();
    check("C4 About shows the edited mission", text((await get("/about")).html).includes("QA site mission text."));
    await clickBtn("ADD MILESTONE"); await sleep(300);
    await setField("year", "2099"); await setField("title", "QA Site Milestone"); await setField("description", "QA milestone description."); await submit();
    // the timeline lists every milestone by year; only the active one's title is rendered
    check("C5 a new milestone appears on About (its year in the timeline)", text((await get("/about")).html).includes("2099"));
    await clickBtn("Delete QA Site Milestone"); await sleep(300); await clickBtn("DELETE", "[role=dialog]"); await settle();
    check("C6 a deleted milestone disappears from About", !text((await get("/about")).html).includes("2099"));

    // restore the content this suite edited (built-in text = what showed before, when the section was never edited)
    for (const id of ["home.hero", "about.pillars", "about.milestones"]) {
      const before = contentBefore[id];
      const r = before ? await adminApi("PUT", `/api/admin/content/${id}`, { data: before }) : await adminApi("PUT", `/api/admin/content/${id}`, { data: RESTORE[id] });
      if (r.status !== 200) check(`restore ${id}`, false, r);
    }
    h = text((await get("/")).html);
    check("C7 restored: home shows its original hero text again", !h.includes("QA SITE BADGE") && h.includes("AI & DS DEPARTMENT • PCE NAGPUR"));

    section("final state");
    const left = [];
    for (const name of ["team", "events", "gallery"]) left.push(...((await adminApi("GET", `/api/admin/${name}`)).json?.data ?? []).filter((x) => String(x.id).startsWith("qa-site-")).map((x) => x.id));
    await cleanup();
    check("Z1 no qa-site-* records left (deleted through the UI)", left.length === 1 && left[0] === "qa-site-m2", left);   // the unpublished draft member is removed by cleanup()
    check("Z2 the browser never called Supabase directly; no page exceptions", !requests.some((r) => /supabase\.co/.test(r.url)) && !page.errors.some((e) => e.startsWith("exception")), page.errors.slice(0, 3));
  }
} catch (e) {
  check(`suite aborted: ${String(e.message || e).slice(0, 300)}`, false);
} finally {
  if (MODE === "backend") { try { await cleanup(); await adminClient?.auth.signOut({ scope: "local" }); } catch {} }
  await page.close();
}
finish();

function finish() {
  const failures = checks.filter((x) => !x.ok);
  const out = join(ROOT, "qa/cms-site/results"); mkdirSync(out, { recursive: true });
  const at = new Date().toISOString();
  const file = join(out, `cms-site-${MODE}-${at.replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, scrub(JSON.stringify({ suite: "cms-site", mode: MODE, at, total: checks.length, passed: checks.length - failures.length, failures, checks }, null, 2)));
  console.log(`\n${checks.length - failures.length}/${checks.length} passed (${MODE}) → ${file.slice(ROOT.length + 1)}`);
  process.exit(failures.length ? 1 : 0);
}
