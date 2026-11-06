// Phase 2 media uploads (bucket site-media, migration 7c): sophia-cms-staging ONLY, against a LOCAL server.
//   node qa/cms-media/cms-media.test.mjs --mode backend --base http://localhost:3010   (CMS_AUTH_MODE=supabase + CMS_FACULTY_MODE=backend)
//   node qa/cms-media/cms-media.test.mjs --mode demo    --base http://localhost:3000   (default build: no upload controls)
// Only qa-media-* records and their files are created; every one is deleted again (records through the API, which
// also empties their folders; any stray test file is removed directly as the admin). No other staging data is touched.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
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

const BUCKET = "site-media";
const MEDIA_BASE = `${env.url}/storage/v1/object/public/${BUCKET}/`;
// test images: real 64×64 solid-colour images generated with sharp (a 1×1 image can't be decoded once next/image
// converts it, which would make the display checks meaningless)
const sharp = createRequire(join(ROOT, "package.json"))("sharp");
const solid = (fmt, r, g, b) => sharp({ create: { width: 64, height: 64, channels: 3, background: { r, g, b } } })[fmt]().toBuffer();
const PNG = await solid("png", 30, 120, 220);
const JPEG = await solid("jpeg", 220, 60, 50);
const WEBP = await solid("webp", 40, 170, 90);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
const TEXT_AS_PNG = Buffer.from("hello, not an image");
const BIG = Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)]);

let A = null, NA = null, adminClient = null;
async function http(method, path, { token, origin, body, form } = {}) {
  const h = {}; if (token) h.Authorization = `Bearer ${token}`; if (origin) h.Origin = origin;
  let payload; if (form) payload = form; else if (body !== undefined) { payload = JSON.stringify(body); h["Content-Type"] = "application/json"; }
  const r = await fetch(BASE + path, { method, headers: h, body: payload, redirect: "manual" });
  return { status: r.status, json: r.status === 204 ? null : await r.json().catch(() => null) };
}
const fd = (module, recordId, bytes, name = "photo.png", type = "image/png") => { const f = new FormData(); f.set("module", module); f.set("recordId", recordId); if (bytes) f.set("file", new Blob([bytes], { type }), name); return f; };
const upload = (module, id, bytes = PNG, name, type, token = A) => http("POST", "/api/admin/uploads", { token, form: fd(module, id, bytes, name, type) });
const head = async (url) => (await fetch(url, { method: "GET", cache: "no-store" })).status;
// whether the object exists in Storage itself: the bucket listing (storage metadata). Public and even authenticated
// downloads can be answered from the CDN cache for a while after a delete, so they can't prove a deletion.
const stored = async (url) => { const path = url.slice(MEDIA_BASE.length); const dir = path.slice(0, path.lastIndexOf("/")); return (await folder(dir)).includes(path); };
const gone = async (url) => !(await stored(url));
const page = (path) => fetch(BASE + path, { cache: "no-store" }).then(async (r) => ({ status: r.status, html: await r.text() }));
const shows = (html, url) => html.includes(url) || html.includes(encodeURIComponent(url));
const pathOf = (url) => url.slice(MEDIA_BASE.length);
async function folder(path) {
  const r = await adminClient.storage.from(BUCKET).list(path, { limit: 100 });
  return (r.data ?? []).map((o) => `${path}/${o.name}`);
}
async function cleanup() {
  if (!A) return;
  for (const name of ["team", "events", "gallery", "faculty"]) {
    const rows = (await http("GET", `/api/admin/${name}`, { token: A })).json?.data ?? [];
    for (const r of rows.filter((x) => String(x.id).startsWith("qa-media-"))) await http("DELETE", `/api/admin/${name}/${r.id}`, { token: A });
  }
  for (const m of ["team", "events", "gallery", "faculty"]) {
    const dirs = (await adminClient.storage.from(BUCKET).list(m, { limit: 100 })).data ?? [];
    for (const d of dirs.filter((x) => x.name.startsWith("qa-media-"))) {
      const files = await folder(`${m}/${d.name}`);
      if (files.length) await adminClient.storage.from(BUCKET).remove(files);
    }
  }
}

const browser = MODE === "demo" || MODE === "backend" ? await launch(9650) : null;
try {
  await browser.viewport("desktop");
  if (MODE === "demo") {
    section("demo mode: no upload controls, Photo URL fields unchanged");
    await browser.goto(BASE + "/login?next=%2Fadmin%2Fteam", 1500);
    await browser.ev(`[...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "Fill in the admin demo credentials").click(), true`); await sleep(200);
    await browser.ev(`document.querySelector('main button[type=submit]').click(), true`); await sleep(2500);
    for (const p of ["/admin/team", "/admin/events", "/admin/gallery", "/admin/faculty"]) {
      await browser.goto(BASE + p, 1500);
      await browser.ev(`[...document.querySelectorAll("button")].find((x) => x.innerText.trim().startsWith("ADD "))?.click(), true`); await sleep(300);
      const d = await browser.ev(`(() => { const d = document.querySelector('[role=dialog]'); return d ? { files: d.querySelectorAll('input[type=file]').length, desc: d.querySelector('[id]')?.innerText ?? "", urlInputs: d.querySelectorAll('input[inputmode=url]').length } : null; })()`);
      check(`DM ${p}: no file upload control in demo mode`, d && d.files === 0, d);
      await browser.ev(`[...document.querySelectorAll('[role=dialog] button')].find((b) => b.innerText.trim() === "CANCEL")?.click(), true`); await sleep(200);
    }
    const t = await page("/team");
    check("DM public pages unchanged (no site-media URLs in demo mode)", !t.html.includes("/storage/v1/object/public/site-media/"));
  } else {
    const c = createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } });
    const s = await c.auth.signInWithPassword({ email: env.adminEmail, password: env.adminPassword });
    if (s.error) throw new Error("admin sign-in failed"); A = s.data.session.access_token; adminClient = c;
    const nc = createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } });
    const ns = extra.QA_NONADMIN_EMAIL ? await nc.auth.signInWithPassword({ email: extra.QA_NONADMIN_EMAIL, password: extra.QA_NONADMIN_PASSWORD }) : { error: true };
    NA = ns.error ? null : ns.data.session.access_token;
    const anonClient = createClient(env.url, env.key, { auth: { persistSession: false } });
    await cleanup();

    section("upload API: access");
    check("A1 anonymous upload → 401", (await http("POST", "/api/admin/uploads", { origin: BASE, form: fd("team", "qa-media-t1", PNG) })).status === 401);
    check("A2 cross-site upload → 403", (await http("POST", "/api/admin/uploads", { origin: "https://evil.example", form: fd("team", "qa-media-t1", PNG) })).status === 403);
    if (NA) check("A3 non-admin user upload → 403", (await upload("team", "qa-media-t1", PNG, "p.png", "image/png", NA)).status === 403);
    else check("A3 non-admin upload (NOT RUN: non-admin sign-in failed)", false);

    section("upload API: validation");
    const ok = await upload("team", "qa-media-t1");
    const url1 = ok.json?.data?.url ?? "";
    check("V1 admin uploads a PNG → 201 with a site-media URL in team/qa-media-t1/<uuid>.png", ok.status === 201 && /^team\/qa-media-t1\/[0-9a-f-]{36}\.png$/.test(pathOf(url1)), ok.json);
    check("V2 the uploaded file is publicly readable by URL", (await head(url1)) === 200);
    const j = await upload("team", "qa-media-t1", JPEG, "a.jpg", "image/jpeg"), w = await upload("team", "qa-media-t1", WEBP, "a.webp", "image/webp");
    check("V3 JPEG and WebP accepted (stored as .jpg / .webp)", j.status === 201 && j.json.data.url.endsWith(".jpg") && w.status === 201 && w.json.data.url.endsWith(".webp"));
    check("V4 a text file named .png is refused (type checked from the bytes)", (await upload("team", "qa-media-t1", TEXT_AS_PNG, "x.png", "image/png")).status === 400);
    check("V5 SVG refused", (await upload("team", "qa-media-t1", SVG, "x.svg", "image/svg+xml")).status === 400);
    check("V6 GIF refused", (await upload("team", "qa-media-t1", GIF, "x.gif", "image/gif")).status === 400);
    check("V7 a 6 MB file → 413", (await upload("team", "qa-media-t1", BIG, "big.png")).status === 413);
    check("V8 empty file → 400; missing file → 400", (await upload("team", "qa-media-t1", Buffer.alloc(0))).status === 400 && (await http("POST", "/api/admin/uploads", { token: A, form: fd("team", "qa-media-t1", null) })).status === 400);
    check("V9 unknown area and unsafe record ids → 400 (no path traversal)", (await upload("private", "qa-media-t1")).status === 400 && (await upload("team", "../faculty")).status === 400 && (await upload("team", "QA Media")).status === 400);
    check("V10 JSON instead of multipart → 415", (await http("POST", "/api/admin/uploads", { token: A, body: { module: "team" } })).status === 415);

    section("storage policies (direct, bypassing the API)");
    const direct = (cl, path) => cl.storage.from(BUCKET).upload(path, PNG, { contentType: "image/png" });
    check("P1 anonymous direct upload refused", !!(await direct(anonClient, `team/qa-media-x/${randomUUID()}.png`)).error);
    if (NA) check("P2 non-admin direct upload refused", !!(await direct(nc, `team/qa-media-x/${randomUUID()}.png`)).error);
    check("P3 admin direct upload outside the allowed paths refused", !!(await direct(adminClient, `private/qa-media-x/${randomUUID()}.png`)).error && !!(await direct(adminClient, "team/qa-media-x/photo.png")).error);
    check("P4 anonymous listing returns nothing", ((await anonClient.storage.from(BUCKET).list("team/qa-media-t1")).data ?? []).length === 0);

    section("Team: save, replace, abandoned upload, remove, delete");
    const created = await http("POST", "/api/admin/team", { token: A, body: { id: "qa-media-t1", name: "QA Media Member", role: "QA", category: "Technical Team", sortOrder: 1, photo: url1, isPublished: true } });
    check("T1 member saved with the uploaded photo", created.status === 201 && created.json.data.photo === url1, created.json);
    check("T2 saving pruned the folder: only the referenced photo is kept (the JPEG/WebP test uploads are gone)", JSON.stringify(await folder("team/qa-media-t1")) === JSON.stringify([pathOf(url1)]), await folder("team/qa-media-t1"));
    check("T3 the public profile shows the photo", shows((await page("/team/qa-media-t1")).html, url1));
    const other = await http("POST", "/api/admin/team", { token: A, body: { id: "qa-media-t2", name: "QA Media Other", role: "QA", category: "Technical Team", sortOrder: 2, photo: url1 } });
    check("T4 another record can't reference this record's file (400 photo)", other.status === 400 && !!other.json?.errors?.photo, other.json);
    const url2 = (await upload("team", "qa-media-t1")).json.data.url;
    const rep = await http("PATCH", "/api/admin/team/qa-media-t1", { token: A, body: { photo: url2 } });
    check("T5 replace: saved with the new photo; the old file is deleted; the new one is served", rep.status === 200 && (await gone(url1)) && (await stored(url2)) && shows((await page("/team/qa-media-t1")).html, url2));
    const url3 = (await upload("team", "qa-media-t1")).json.data.url;
    await http("PATCH", "/api/admin/team/qa-media-t1", { token: A, body: { role: "QA Lead" } });
    check("T6 an upload that was never saved is removed at the next save; the referenced photo stays", (await gone(url3)) && (await head(url2)) === 200);
    const rm = await http("PATCH", "/api/admin/team/qa-media-t1", { token: A, body: { photo: "" } });
    const prof = (await page("/team/qa-media-t1")).html;
    check("T7 remove photo: record cleared, file deleted, profile shows the initials placeholder", rm.status === 200 && rm.json.data.photo === undefined && (await gone(url2)) && !prof.includes("site-media") && prof.includes("no photo published"));
    const url4 = (await upload("team", "qa-media-t1")).json.data.url;
    await http("PATCH", "/api/admin/team/qa-media-t1", { token: A, body: { photo: url4, isPublished: false } });
    check("T8 an unpublished record's photo is not on any public page", !shows((await page("/team")).html, url4) && (await page("/team/qa-media-t1")).status === 404);
    const del = await http("DELETE", "/api/admin/team/qa-media-t1", { token: A });
    check("T9 delete: the record's folder is emptied", del.status === 204 && (await gone(url4)) && (await folder("team/qa-media-t1")).length === 0);

    section("referenced files are never deleted");
    const k1 = (await upload("team", "qa-media-k1")).json.data.url;
    await http("POST", "/api/admin/team", { token: A, body: { id: "qa-media-k1", name: "QA Media Keep", role: "QA", category: "Technical Team", sortOrder: 4, photo: k1 } });
    const k2 = (await upload("team", "qa-media-k2")).json.data.url;
    await http("POST", "/api/admin/team", { token: A, body: { id: "qa-media-k2", name: "QA Media Keep 2", role: "QA", category: "Technical Team", sortOrder: 5, photo: k2 } });
    await http("PATCH", "/api/admin/team/qa-media-k2", { token: A, body: { photo: "" } });
    await http("DELETE", "/api/admin/team/qa-media-k2", { token: A });
    await http("PATCH", "/api/admin/team/qa-media-k1", { token: A, body: { role: "QA 2" } });
    check("K1 another record's saves and deletion never touch this record's referenced file; its own unrelated save keeps it", (await stored(k1)) && (await head(k1)) === 200 && (await folder("team/qa-media-k1")).length === 1);
    await http("DELETE", "/api/admin/team/qa-media-k1", { token: A });

    section("Events poster");
    const p1 = (await upload("events", "qa-media-e1")).json.data.url;
    const ev = await http("POST", "/api/admin/events", { token: A, body: { id: "qa-media-e1", name: "QA Media Event", date: "2026-12-20", venue: "QA", status: "upcoming", description: "QA", poster: p1, isPublished: true } });
    check("E1 event saved with an uploaded poster; the public page shows it", ev.status === 201 && shows((await page("/events/qa-media-e1")).html, p1), ev.json);
    const p2 = (await upload("events", "qa-media-e1", JPEG, "p.jpg", "image/jpeg")).json.data.url;
    await http("PATCH", "/api/admin/events/qa-media-e1", { token: A, body: { poster: p2 } });
    check("E2 poster replaced: old file gone, new shown", (await gone(p1)) && shows((await page("/events/qa-media-e1")).html, p2));
    check("E3 the poster stays required (can't be removed)", (await http("PATCH", "/api/admin/events/qa-media-e1", { token: A, body: { poster: "" } })).status === 400);
    await http("DELETE", "/api/admin/events/qa-media-e1", { token: A });
    check("E4 delete: poster file gone", (await gone(p2)));

    section("Gallery photos and YouTube videos");
    const g1 = (await upload("gallery", "qa-media-g1", WEBP, "g.webp", "image/webp")).json.data.url;
    const gp = await http("POST", "/api/admin/gallery", { token: A, body: { id: "qa-media-g1", title: "QA Media Photo", category: "photo", event: "General", year: 2026, url: g1, isPublished: true, isFeatured: true } });
    const gv = await http("POST", "/api/admin/gallery", { token: A, body: { id: "qa-media-g2", title: "QA Media Video", category: "video", event: "General", year: 2026, url: "https://www.youtube.com/watch?v=LTCbZGLpdE0", isPublished: true } });
    const gal = (await page("/gallery")).html, home = (await page("/")).html;
    check("G1 an uploaded gallery photo and a YouTube video are saved and shown (gallery + home highlights)", gp.status === 201 && gv.status === 201 && shows(gal, g1) && shows(home, g1) && gal.includes("QA Media Video"));
    const vf = await http("POST", "/api/admin/gallery", { token: A, body: { id: "qa-media-g3", title: "x", category: "video", event: "General", year: 2026, url: g1 } });
    check("G2 a video can't point at an uploaded image or a non-YouTube file", vf.status === 400 && !!vf.json?.errors?.url);
    await http("DELETE", "/api/admin/gallery/qa-media-g1", { token: A });
    check("G3 delete: gallery photo file gone and no longer on /gallery", (await gone(g1)) && !shows((await page("/gallery")).html, g1));

    section("Faculty photo (with permission)");
    await http("POST", "/api/admin/faculty", { token: A, body: { id: "qa-media-f1", name: "QA Media Faculty", designation: "QA", sortOrder: 990, isPublished: false } });
    const f1 = (await upload("faculty", "qa-media-f1")).json.data.url;
    const noConsent = await http("PATCH", "/api/admin/faculty/qa-media-f1", { token: A, body: { image: f1 } });
    check("F1 a photo without permission is refused (400 imageConsent)", noConsent.status === 400 && !!noConsent.json?.errors?.imageConsent, noConsent.json);
    const withConsent = await http("PATCH", "/api/admin/faculty/qa-media-f1", { token: A, body: { image: f1, imageConsent: "QA test image (no real person)" } });
    check("F2 with permission: saved; the Admin list returns the photo URL and the permission", withConsent.status === 200 && withConsent.json.data.image === f1 && withConsent.json.data.imageConsent === "QA test image (no real person)", withConsent.json);
    check("F3 unpublished: the photo is not on About", !shows((await page("/about")).html, f1));
    await http("PATCH", "/api/admin/faculty/qa-media-f1", { token: A, body: { isPublished: true } });
    check("F4 published: About shows the photo", shows((await page("/about")).html, f1));
    const ff = await http("PATCH", "/api/admin/faculty/qa-media-f1", { token: A, body: { image: url1 } });
    check("F5 a team photo URL can't be used for faculty (own folder only)", ff.status === 400 && !!ff.json?.errors?.image);
    await http("PATCH", "/api/admin/faculty/qa-media-f1", { token: A, body: { image: "" } });
    check("F6 remove photo: file deleted, About shows initials", (await gone(f1)) && !shows((await page("/about")).html, f1));
    await http("DELETE", "/api/admin/faculty/qa-media-f1", { token: A });

    section("Admin UI (real browser): upload, save, replace, remove for every module");
    const tmpDir = join(tmpdir(), `qa-media-ui-${Date.now()}`); mkdirSync(tmpDir, { recursive: true });
    const fileA = join(tmpDir, "a.png"), fileB = join(tmpDir, "b.jpg");
    writeFileSync(fileA, PNG); writeFileSync(fileB, JPEG);
    try {
      await browser.goto(BASE + "/login?next=%2Fadmin%2Fteam", 1500);
      await browser.ev(`(() => { const set = (s, v) => { const el = document.querySelector(s); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); }; set("main input[type=email]", ${JSON.stringify(env.adminEmail)}); set("main input[type=password]", ${JSON.stringify(env.adminPassword)}); document.querySelector("main button[type=submit]").click(); return true; })()`);
      for (let i = 0; i < 100 && !(await browser.ev(`location.pathname === "/admin/team" && !!document.querySelector("table")`)); i++) await sleep(200);
      check("U0 admin signed in through the real login form", await browser.ev(`location.pathname === "/admin/team"`));

      const setVal = (name, v) => browser.ev(`(() => { const el = document.querySelector('[role=dialog] [name="${name}"]'); if (!el) return false; const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(String(v))}); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
      const setCheckbox = (name, on) => browser.ev(`(() => { const el = document.querySelector('[role=dialog] [name="${name}"]'); if (!el) return false; if (el.checked !== ${on}) el.click(); return true; })()`);
      const fieldVal = (name) => browser.ev(`document.querySelector('[role=dialog] [name="${name}"]')?.value ?? ""`);
      const dialogOpen = () => browser.ev(`!!document.querySelector('[role=dialog]')`);
      const fieldError = (name) => browser.ev(`(() => { const e = [...document.querySelectorAll('[role=dialog] [id$="-${name}-error"]')][0]; return e ? e.innerText.trim() : ""; })()`);
      // case-insensitive: some buttons are styled uppercase, so innerText differs from the source text
      const clickText = (text) => browser.ev(`(() => { const t = ${JSON.stringify(text.toLowerCase())}; const b = [...document.querySelectorAll("button")].find((x) => x.innerText.trim().toLowerCase() === t || (x.getAttribute("aria-label") || "").toLowerCase() === t); if (!b) return false; b.click(); return true; })()`);
      const waitClosed = async () => { for (let i = 0; i < 75 && (await dialogOpen()); i++) await sleep(200); return !(await dialogOpen()); };
      async function chooseFile(label, file, field) {
        const before = await fieldVal(field);
        const doc = await browser.send("DOM.getDocument", { depth: -1 });
        const q = await browser.send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: `[role=dialog] input[type=file][aria-label="Upload ${label}"]` });
        if (!q.nodeId) return { ok: false, why: "no upload control" };
        await browser.send("DOM.setFileInputFiles", { files: [file], nodeId: q.nodeId });
        let v = before;
        for (let i = 0; i < 75 && (v === before || !v.startsWith(MEDIA_BASE)); i++) { await sleep(200); v = await fieldVal(field); }
        const preview = await browser.ev(`[...document.querySelectorAll('[role=dialog] img')].some((i) => (i.currentSrc || i.src).includes(${JSON.stringify(encodeURIComponent(v))}))`);
        return { ok: v !== before && v.startsWith(MEDIA_BASE), url: v, preview };
      }
      // the public page must actually load the image in the browser (not just mention its URL)
      const lastDisplay = {};
      async function publicImageLoads(path, url, scroll = false) {
        await browser.goto(BASE + path, 1200);
        const enc = JSON.stringify(encodeURIComponent(url));
        let r = "missing";
        for (let i = 0; i < 40; i++) {
          r = await browser.ev(`(() => { const img = [...document.images].find((i) => (i.currentSrc || i.src).includes(${enc}) || (i.getAttribute("src") || "").includes(${enc})); if (!img) return "missing"; ${scroll ? "img.scrollIntoView();" : ""} return img.complete && img.naturalWidth > 0 ? "loaded" : "pending"; })()`);
          if (r === "loaded") return true;
          if (r === "missing" && i > 10) break;
          await sleep(300);
        }
        Object.assign(lastDisplay, { path, state: r, status: await browser.ev("document.title"), imgs: await browser.ev("[...document.images].map((i) => (i.getAttribute('src') || '').slice(0, 90))") });
        return false;
      }

      const flows = [
        { module: "team", admin: "/admin/team", add: "ADD MEMBER", id: "qa-media-ui-t", name: "QA Media UI Member", label: "Photo URL", field: "photo", pub: (id) => `/team/${id}`, removable: true,
          fill: async () => { await setVal("name", "QA Media UI Member"); await setVal("id", "qa-media-ui-t"); await setVal("role", "QA"); } },
        { module: "events", admin: "/admin/events", add: "ADD EVENT", id: "qa-media-ui-e", name: "QA Media UI Event", label: "Poster URL", field: "poster", pub: (id) => `/events/${id}`, removable: false,
          fill: async () => { await setVal("name", "QA Media UI Event"); await setVal("id", "qa-media-ui-e"); await setVal("date", "2026-12-21"); await setVal("venue", "QA Hall"); await setVal("status", "upcoming"); await setVal("description", "QA media event."); } },
        { module: "gallery", admin: "/admin/gallery", add: "ADD MEDIA ITEM", id: "qa-media-ui-g", name: "QA Media UI Photo", label: "Media URL", field: "url", pub: () => "/gallery?event=QA%20Media%20UI", removable: false, scroll: true,
          fill: async () => { await setVal("title", "QA Media UI Photo"); await setVal("id", "qa-media-ui-g"); await setVal("category", "photo"); await setVal("event", "QA Media UI"); await setVal("year", "2026"); } },
        { module: "faculty", admin: "/admin/faculty", add: "ADD FACULTY MEMBER", id: "qa-media-ui-f", name: "QA Media UI Faculty", label: "Photo", field: "image", pub: () => "/about", removable: true, scroll: true,
          fill: async () => { await setVal("name", "QA Media UI Faculty"); await setVal("id", "qa-media-ui-f"); await setVal("designation", "QA"); await setVal("sortOrder", "999"); await setVal("imageConsent", "QA test image (no real person)"); } },
      ];
      for (const f of flows) {
        const tag = f.module.toUpperCase();
        await browser.goto(BASE + f.admin, 800);
        for (let i = 0; i < 75 && !(await browser.ev(`!!document.querySelector("table")`)); i++) await sleep(200);
        await clickText(f.add); await sleep(400);
        await f.fill();
        const up1 = await chooseFile(f.label, fileA, f.field);
        check(`${tag}-1 browser upload in the Add dialog fills the field with the stored file and shows the preview`, up1.ok && up1.preview && up1.url.includes(`/${f.module}/${f.id}/`), up1);
        await setCheckbox("isPublished", true);
        await browser.ev(`document.querySelector('[role=dialog] button[type=submit]').click(), true`);
        const saved1 = await waitClosed();
        const rec1 = ((await http("GET", `/api/admin/${f.module}`, { token: A })).json?.data ?? []).find((r) => r.id === f.id);
        check(`${tag}-2 saved through the dialog; the stored record holds the uploaded file`, saved1 && rec1 && rec1[f.field] === up1.url, { saved1, stored: rec1?.[f.field], uploaded: up1.url });
        check(`${tag}-3 the public page (${f.pub(f.id)}) loads and displays the uploaded image`, await publicImageLoads(f.pub(f.id), up1.url, f.scroll), lastDisplay);

        await browser.goto(BASE + f.admin, 800);
        for (let i = 0; i < 75 && !(await browser.ev(`!!document.querySelector("table")`)); i++) await sleep(200);
        await clickText(`Edit ${f.name}`); await sleep(400);
        const up2 = await chooseFile(f.label, fileB, f.field);
        check(`${tag}-4 replace: a second browser upload in the Edit dialog`, up2.ok && up2.preview && up2.url !== up1.url, up2);
        check(`${tag}-5 before saving, the old file is still stored (only referenced files count; nothing is deleted early)`, await stored(up1.url));
        await browser.ev(`document.querySelector('[role=dialog] button[type=submit]').click(), true`);
        const saved2 = await waitClosed();
        const six = { saved2, oldGone: await gone(up1.url), newStored: await stored(up2.url), shown: await publicImageLoads(f.pub(f.id), up2.url, f.scroll), stored: ((await http("GET", `/api/admin/${f.module}`, { token: A })).json?.data ?? []).find((r) => r.id === f.id)?.[f.field] === up2.url, folder: await folder(`${f.module}/${f.id}`) };
        check(`${tag}-6 saved: the old file is deleted, the new one is stored and displayed publicly`, six.saved2 && six.oldGone && six.newStored && six.shown, { ...six, display: six.shown ? undefined : lastDisplay });

        await browser.goto(BASE + f.admin, 800);
        for (let i = 0; i < 75 && !(await browser.ev(`!!document.querySelector("table")`)); i++) await sleep(200);
        await clickText(`Edit ${f.name}`); await sleep(400);
        await clickText("Remove photo"); await sleep(200);
        await browser.ev(`document.querySelector('[role=dialog] button[type=submit]').click(), true`);
        if (f.removable) {
          const saved3 = await waitClosed();
          const pubHtml = (await page(f.pub(f.id))).html;
          check(`${tag}-7 remove photo in the browser: saved, file deleted, public page no longer shows it`, saved3 && (await gone(up2.url)) && !shows(pubHtml, up2.url));
        } else {
          await sleep(800);
          const err = await fieldError(f.field);
          check(`${tag}-7 remove: refused because this image is required (the stored file stays)`, (await dialogOpen()) && /required/i.test(err) && (await stored(up2.url)), err);
          await clickText("CANCEL"); await waitClosed();
        }
        // delete the test record in the browser
        await clickText(`Delete ${f.name}`); await sleep(300);
        await browser.ev(`[...document.querySelectorAll('[role=dialog] button')].find((b) => b.innerText.trim() === "DELETE")?.click(), true`);
        await waitClosed(); await sleep(400);
        const eight = { folder: await folder(`${f.module}/${f.id}`), recordLeft: ((await http("GET", `/api/admin/${f.module}`, { token: A })).json?.data ?? []).some((r) => r.id === f.id) };
        check(`${tag}-8 deleting the record in the browser empties its folder`, eight.folder.length === 0 && !eight.recordLeft && (await gone(up2.url)), eight);
      }

      // abandoned upload in an Add dialog that is cancelled: removed when a record with that id is next saved
      await browser.goto(BASE + "/admin/team", 800);
      for (let i = 0; i < 75 && !(await browser.ev(`!!document.querySelector("table")`)); i++) await sleep(200);
      await clickText("ADD MEMBER"); await sleep(400);
      await setVal("name", "QA Media Abandoned"); await setVal("id", "qa-media-ui-x"); await setVal("role", "QA");
      const ab = await chooseFile("Photo URL", fileA, "photo");
      await clickText("CANCEL"); await waitClosed();
      check("X1 cancelled Add dialog: the uploaded file is not referenced by any record (it stays until that id is used)", ab.ok && (await stored(ab.url)));
      const x = await http("POST", "/api/admin/team", { token: A, body: { id: "qa-media-ui-x", name: "QA Media Abandoned", role: "QA", category: "Technical Team", sortOrder: 3 } });
      check("X2 saving a record with that id removes the abandoned file", x.status === 201 && (await gone(ab.url)), { status: x.status, abandoned: ab.url.slice(MEDIA_BASE.length), folder: await folder("team/qa-media-ui-x") });
      await http("DELETE", "/api/admin/team/qa-media-ui-x", { token: A });
    } finally { rmSync(tmpDir, { recursive: true, force: true }); }

    section("final state");
    await cleanup();
    const left = [];
    for (const m of ["team", "events", "gallery", "faculty"]) left.push(...(((await adminClient.storage.from(BUCKET).list(m, { limit: 100 })).data ?? []).filter((d) => d.name.startsWith("qa-media-")).map((d) => `${m}/${d.name}`)));
    const leftFiles = []; for (const d of left) leftFiles.push(...(await folder(d)));
    check("Z1 no qa-media-* files or records left", leftFiles.length === 0, leftFiles);
    check("Z2 no page exceptions in the Admin UI", !browser.errors.some((e) => e.startsWith("exception")), browser.errors.slice(0, 3));
  }
} catch (e) {
  check(`suite aborted: ${String(e.message || e).slice(0, 300)}`, false);
} finally {
  if (MODE === "backend") { try { await cleanup(); await adminClient?.auth.signOut({ scope: "local" }); } catch {} }
  await browser?.close();
}
const failures = checks.filter((x) => !x.ok);
const out = join(ROOT, "qa/cms-media/results"); mkdirSync(out, { recursive: true });
const at = new Date().toISOString();
const file = join(out, `cms-media-${MODE}-${at.replace(/[:.]/g, "-")}.json`);
writeFileSync(file, scrub(JSON.stringify({ suite: "cms-media", mode: MODE, at, total: checks.length, passed: checks.length - failures.length, failures, checks }, null, 2)));
console.log(`\n${checks.length - failures.length}/${checks.length} passed (${MODE}) → ${file.slice(ROOT.length + 1)}`);
process.exit(failures.length ? 1 : 0);
