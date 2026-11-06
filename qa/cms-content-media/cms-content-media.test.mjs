// Admin → Content photo upload (Home · About section), reusing site-media under the reserved folder
// gallery/content-home-about/ (no migration). sophia-cms-staging ONLY, against a LOCAL server.
//   node qa/cms-content-media/cms-content-media.test.mjs --mode backend --base http://localhost:3010   (CMS_AUTH_MODE=supabase + CMS_FACULTY_MODE=backend)
//   node qa/cms-content-media/cms-content-media.test.mjs --mode demo    --base http://localhost:3020   (demo build)
// Writes only: the "Home · About section" content (restored at the end: its previous saved data, or the built-in text
// with no photo, which is what showed before), test files in the reserved folder (all removed), and qa-content-media-*
// Gallery records (deleted). It refuses to run if the section already holds an uploaded photo (an owner's photo).
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
const BASE = arg("base", MODE === "demo" ? "http://localhost:3020" : "http://localhost:3010").replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE)) { console.error("REFUSED: --base must be a local server."); process.exit(2); }
const env = loadQaEnv(ROOT);
const appRef = readFileSync(join(ROOT, ".env.local"), "utf8").match(/NEXT_PUBLIC_SUPABASE_URL\s*=\s*https:\/\/([a-z0-9]{20})\.supabase\.co/)?.[1];
if (appRef !== STAGING_REF) { console.error("REFUSED: .env.local does not point at sophia-cms-staging."); process.exit(2); }
const secrets = [env.key, env.adminPassword, env.adminEmail].filter(Boolean);
const scrub = (s) => { let o = redact(String(s), env); for (const v of secrets) o = o.split(v).join("[redacted]"); return o; };
const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok: !!ok, ...(ok || detail === undefined ? {} : { detail: scrub(JSON.stringify(detail)).slice(0, 1000) }) }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : "  — " + scrub(JSON.stringify(detail)).slice(0, 400)}`); };
const section = (t) => console.log(`\n== ${t}`);

const BUCKET = "site-media";
const MEDIA_BASE = `${env.url}/storage/v1/object/public/${BUCKET}/`;
const FOLDER = "gallery/content-home-about";
const SECTION = "home.about";
// the built-in text of "Home · About section" (src/data/siteContent.ts): what shows when the section was never saved
const DEFAULTS = {
  eyebrow: "ABOUT SOPHIA FORUM", heading1: "MORE THAN A CLUB.", heading2: "A TECH MOVEMENT.",
  paragraph: "A platform for AI & DS students to connect, collaborate, learn and build together.",
  feature1: "Technical Events", feature2: "Student Community", feature3: "Innovation & Projects", feature4: "Learning & Collaboration",
  button: "DISCOVER OUR MISSION", photo: "", photoCaption: "", photoBadge: "50+ MEMBERS", footerLeft: "Community Driven", footerRight: "Est. 2020",
};
const PLACEHOLDER = "Sophia Forum (no photo published)"; // the About card's initials placeholder (FallbackImage)

const sharp = createRequire(join(ROOT, "package.json"))("sharp");
const solid = (fmt, r, g, b) => sharp({ create: { width: 160, height: 100, channels: 3, background: { r, g, b } } })[fmt]().toBuffer();
const PNG = await solid("png", 30, 120, 220), JPEG = await solid("jpeg", 220, 60, 50), WEBP = await solid("webp", 40, 170, 90);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const TEXT_AS_PNG = Buffer.from("hello, not an image");
const BIG = Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)]);

let A = null, adminClient = null;
async function http(method, path, { token = A, body, form } = {}) {
  const h = {}; if (token) h.Authorization = `Bearer ${token}`;
  let payload; if (form) payload = form; else if (body !== undefined) { payload = JSON.stringify(body); h["Content-Type"] = "application/json"; }
  const r = await fetch(BASE + path, { method, headers: h, body: payload, redirect: "manual" });
  return { status: r.status, json: r.status === 204 ? null : await r.json().catch(() => null) };
}
const upload = (module, id, bytes = PNG, name = "photo.png", type = "image/png") => {
  const f = new FormData(); f.set("module", module); f.set("recordId", id); f.set("file", new Blob([bytes], { type }), name);
  return http("POST", "/api/admin/uploads", { form: f });
};
const saveAbout = (data) => http("PUT", `/api/admin/content/${SECTION}`, { body: { data } });
async function folder(path) { const r = await adminClient.storage.from(BUCKET).list(path, { limit: 100 }); return (r.data ?? []).map((o) => `${path}/${o.name}`); }
const pathOf = (url) => url.slice(MEDIA_BASE.length);
const page = (path) => fetch(BASE + path, { cache: "no-store" }).then(async (r) => ({ status: r.status, html: await r.text() }));
const shows = (html, url) => html.includes(url) || html.includes(encodeURIComponent(url));
const fakeMedia = (dir) => `${MEDIA_BASE}${dir}/${randomUUID()}.png`;

let restoreData = null;
async function restore() {
  if (!A || !restoreData) return;
  const r = await saveAbout(restoreData); // prunes the reserved folder of every test file (none is referenced)
  if (r.status !== 200) console.log(`restore failed: ${r.status}`);
  const left = await folder(FOLDER);
  if (left.length && !String(restoreData.photo ?? "").startsWith(MEDIA_BASE)) await adminClient.storage.from(BUCKET).remove(left);
  const rows = (await http("GET", "/api/admin/gallery")).json?.data ?? [];
  for (const g of rows.filter((x) => String(x.id).startsWith("qa-content-media-"))) await http("DELETE", `/api/admin/gallery/${g.id}`);
  // the Gallery UI control upload (GU4) is never saved: remove its file directly
  const stray = await folder("gallery/qa-content-media-g3");
  if (stray.length) await adminClient.storage.from(BUCKET).remove(stray);
}

const browser = await launch(9660);
try {
  await browser.viewport("desktop");
  if (MODE === "demo") {
    section("demo mode");
    const home = await page("/");
    check("DM1 homepage About card unchanged: initials placeholder, no site-media image", home.status === 200 && home.html.includes(PLACEHOLDER) && !home.html.includes("/storage/v1/object/public/site-media/"));
    await browser.goto(BASE + "/login?next=%2Fadmin%2Fcontent", 1500);
    await browser.ev(`[...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "Fill in the admin demo credentials")?.click(), true`); await sleep(200);
    await browser.ev(`document.querySelector('main button[type=submit]')?.click(), true`); await sleep(2500);
    await browser.goto(BASE + "/admin/content", 2000);
    const t = await browser.ev(`document.querySelector("main")?.innerText ?? ""`);
    check("DM2 Admin → Content in demo mode: the existing notice, no upload control", /Content editing is available when the dashboard runs on the CMS backend/.test(t) && !(await browser.ev(`!!document.querySelector('input[type=file]')`)), t.slice(0, 200));
    await browser.goto(BASE + "/admin/gallery", 1500);
    check("DM3 Admin → Gallery still renders in demo mode", await browser.ev(`!!document.querySelector("main table")`));
    check("DM4 no page exceptions", !browser.errors.some((e) => e.startsWith("exception")), browser.errors.slice(0, 3));
  } else {
    const c = createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } });
    const s = await c.auth.signInWithPassword({ email: env.adminEmail, password: env.adminPassword });
    if (s.error) throw new Error("admin sign-in failed"); A = s.data.session.access_token; adminClient = c;

    section("before");
    const stored = (await http("GET", "/api/admin/content")).json?.data ?? {};
    const before = stored[SECTION];
    if (before && String(before.photo ?? "").startsWith(MEDIA_BASE)) throw new Error(`REFUSED: "${SECTION}" already holds an uploaded photo; not replacing an owner's photo.`);
    restoreData = before ? { ...before } : { ...DEFAULTS };
    const preFolder = await folder(FOLDER);
    check("B1 the reserved folder holds no files before the suite", preFolder.length === 0, preFolder);
    if (preFolder.length) throw new Error("REFUSED: the reserved folder is not empty.");
    const home0 = await page("/");
    check(`B2 homepage About card before: ${before ? "saved section" : "built-in text with the initials placeholder"}`, home0.html.includes(PLACEHOLDER) || !!before?.photo, { saved: !!before });

    section("uploads (existing endpoint and safety checks)");
    const u1 = await upload("gallery", "content-home-about", PNG);
    const U1 = u1.json?.data?.url ?? "";
    check("U1 PNG upload to gallery/content-home-about → 201, filed in the reserved folder", u1.status === 201 && pathOf(U1).startsWith(`${FOLDER}/`), u1);
    const bad = await upload("gallery", "content-home-about", TEXT_AS_PNG, "fake.png", "image/png");
    check("U2 a non-image named .png → 400 (type read from the file's bytes)", bad.status === 400, bad);
    const svg = await upload("gallery", "content-home-about", SVG, "x.svg", "image/svg+xml");
    check("U3 SVG → 400", svg.status === 400, svg);
    const big = await upload("gallery", "content-home-about", BIG, "big.png", "image/png");
    check("U4 over 5 MB → 413", big.status === 413, big);
    const area = await upload("content", "home-about", PNG);
    check("U5 no new upload area: module 'content' → 400", area.status === 400, area);
    check("U6 only the valid upload was stored", JSON.stringify(await folder(FOLDER)) === JSON.stringify([pathOf(U1)]), await folder(FOLDER));

    section("Content validation");
    for (const [label, photo] of [["an external URL", "https://example.com/photo.jpg"], ["a media URL from another gallery folder", fakeMedia("gallery/qa-other")],
      ["a media URL from the team area", fakeMedia("team/content-home-about")], ["a look-alike folder (content-home-about-x)", fakeMedia("gallery/content-home-about-x")], ["a javascript: URL", "javascript:alert(1)"]]) {
      const r = await saveAbout({ ...restoreData, photo });
      check(`V photo = ${label} → 400 on the Photo field`, r.status === 400 && !!r.json?.errors?.photo, r);
    }
    const longHead = await saveAbout({ ...restoreData, heading1: "x".repeat(61) });
    check("V other fields keep their rules (heading over 60 characters → 400)", longHead.status === 400 && !!longHead.json?.errors?.heading1, longHead);
    check("V rejected saves stored nothing and pruned nothing", JSON.stringify(await folder(FOLDER)) === JSON.stringify([pathOf(U1)]));

    section("save, public display, replacement and clean-up");
    const s1 = await saveAbout({ ...restoreData, photo: U1 });
    check("S1 save with the uploaded photo → 200", s1.status === 200 && s1.json?.data?.photo === U1, s1);
    const h1 = await page("/");
    check("S2 homepage About card shows the photo (no initials placeholder)", shows(h1.html, U1) && !h1.html.includes(PLACEHOLDER));
    await browser.goto(BASE + "/", 1500);
    await browser.ev(`(async () => { const h = [...document.querySelectorAll("h2")].find((x) => /MORE THAN A CLUB|${String(restoreData.heading1).replace(/[^A-Za-z ]/g, "")}/.test(x.innerText)); h?.scrollIntoView(); await new Promise((r) => setTimeout(r, 1500)); return true; })()`);
    const loaded = await browser.ev(`[...document.querySelectorAll("img")].some((i) => (i.currentSrc || i.src).includes(${JSON.stringify(encodeURIComponent(U1))}) && i.complete && i.naturalWidth > 0)`);
    check("S3 the browser actually loads the About photo", loaded);

    const U2 = (await upload("gallery", "content-home-about", JPEG, "b.jpg", "image/jpeg")).json?.data?.url ?? "";
    const s2 = await saveAbout({ ...restoreData, photo: U2 });
    const f2 = await folder(FOLDER);
    check("R1 replacing the photo → 200; the old file is deleted, the new one kept", s2.status === 200 && JSON.stringify(f2) === JSON.stringify([pathOf(U2)]), f2);
    check("R2 homepage shows the new photo, not the old one", (await page("/")).html.includes(encodeURIComponent(U2)));

    const U3 = (await upload("gallery", "content-home-about", WEBP, "c.webp", "image/webp")).json?.data?.url ?? "";
    const failed = await saveAbout({ ...restoreData, heading1: "y".repeat(61), photo: U3 });
    const f3 = await folder(FOLDER);
    check("F1 a failed save (400) deletes nothing: the displayed photo and the pending upload both remain", failed.status === 400 && f3.includes(pathOf(U2)) && f3.includes(pathOf(U3)), { status: failed.status, f3 });
    check("F2 after the failed save the homepage still shows the current photo", (await page("/")).html.includes(encodeURIComponent(U2)));

    section("Gallery cannot use the reserved id or folder");
    const g1 = await http("POST", "/api/admin/gallery", { body: { id: "content-home-about", title: "QA", category: "photo", event: "General", year: 2026, url: "/images/sophia-forum-logo.png" } });
    check("G1 create a Gallery record with id content-home-about → 400 (reserved)", g1.status === 400 && /reserved/i.test(g1.json?.errors?.id ?? ""), g1);
    const g2 = await http("PATCH", "/api/admin/gallery/content-home-about", { body: { title: "QA" } });
    check("G2 update /api/admin/gallery/content-home-about → 400 (reserved)", g2.status === 400 && /reserved/i.test(g2.json?.error ?? ""), g2);
    const g3 = await http("DELETE", "/api/admin/gallery/content-home-about");
    const f4 = await folder(FOLDER);
    check("G3 delete /api/admin/gallery/content-home-about → 400; the reserved folder is untouched", g3.status === 400 && f4.includes(pathOf(U2)) && f4.includes(pathOf(U3)), { status: g3.status, f4 });
    const g4 = await http("POST", "/api/admin/gallery", { body: { id: "qa-content-media-g2", title: "QA", category: "photo", event: "General", year: 2026, url: U2 } });
    check("G4 a Gallery record can't reference the Content photo → 400", g4.status === 400 && !!g4.json?.errors?.url, g4);

    section("ordinary Gallery uploads and deletions still work");
    const gp = (await upload("gallery", "qa-content-media-g1", PNG)).json?.data?.url ?? "";
    const gc = await http("POST", "/api/admin/gallery", { body: { id: "qa-content-media-g1", title: "QA Content Media", category: "photo", event: "General", year: 2026, url: gp, isPublished: false } });
    check("O1 upload + create an ordinary Gallery photo → 201", gc.status === 201 && gc.json?.data?.url === gp, gc);
    const gd = await http("DELETE", "/api/admin/gallery/qa-content-media-g1");
    const gLeft = await folder("gallery/qa-content-media-g1");
    check("O2 deleting it → 204 and empties its own folder", gd.status === 204 && gLeft.length === 0, { status: gd.status, gLeft });
    check("O3 the reserved Content folder is untouched by that deletion", (await folder(FOLDER)).includes(pathOf(U2)));

    section("site image paths still work");
    const s4 = await saveAbout({ ...restoreData, photo: "/images/sophia-forum-logo.png" });
    const f5 = await folder(FOLDER);
    check("I1 photo = /images/… → 200; no uploaded file is referenced, so the folder is emptied", s4.status === 200 && f5.length === 0, { status: s4.status, f5 });
    check("I2 homepage shows the site image", (await page("/")).html.includes(encodeURIComponent("/images/sophia-forum-logo.png")));

    section("Admin → Content (real browser): upload, preview, save, replace");
    const tmp = join(tmpdir(), `qa-content-media-${Date.now()}`); mkdirSync(tmp, { recursive: true });
    const fileA = join(tmp, "a.png"), fileB = join(tmp, "b.jpg"); writeFileSync(fileA, PNG); writeFileSync(fileB, JPEG);
    try {
      await browser.goto(BASE + "/login?next=%2Fadmin%2Fcontent", 1500);
      await browser.ev(`(() => { const set = (s, v) => { const el = document.querySelector(s); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); }; set("main input[type=email]", ${JSON.stringify(env.adminEmail)}); set("main input[type=password]", ${JSON.stringify(env.adminPassword)}); document.querySelector("main button[type=submit]").click(); return true; })()`);
      for (let i = 0; i < 100 && !(await browser.ev(`location.pathname === "/admin/content" && !!document.querySelector("table")`).catch(() => false)); i++) await sleep(200);
      const fieldVal = () => browser.ev(`document.querySelector('[role=dialog] [name="photo"]')?.value ?? ""`);
      const dialogOpen = () => browser.ev(`!!document.querySelector('[role=dialog]')`);
      const openAbout = async () => { await browser.ev(`document.querySelector('button[aria-label="Edit Home · About section"]')?.click(), true`); for (let i = 0; i < 40 && !(await dialogOpen()); i++) await sleep(150); };
      const save = async () => { await browser.ev(`document.querySelector('[role=dialog] button[type=submit]').click(), true`); for (let i = 0; i < 75 && (await dialogOpen()); i++) await sleep(200); return !(await dialogOpen()); };
      async function choose(file) {
        const was = await fieldVal();
        const doc = await browser.send("DOM.getDocument", { depth: -1 });
        const q = await browser.send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: `[role=dialog] input[type=file]` });
        if (!q.nodeId) return { ok: false, why: "no upload control" };
        await browser.send("DOM.setFileInputFiles", { files: [file], nodeId: q.nodeId });
        let v = was; for (let i = 0; i < 75 && (v === was || !v.startsWith(MEDIA_BASE)); i++) { await sleep(200); v = await fieldVal(); }
        // the preview must show the uploaded file, loaded in the browser (polled: the optimised image takes a moment)
        const previewExpr = `(() => { const want = encodeURIComponent(document.querySelector('[role=dialog] [name="photo"]').value); const img = [...document.querySelectorAll('[role=dialog] img')].find((i) => (i.currentSrc || i.src).includes(want)); return img ? { src: (img.currentSrc || img.src).slice(0, 120), loaded: img.complete && img.naturalWidth > 0 } : { src: null, imgs: [...document.querySelectorAll('[role=dialog] img')].map((i) => (i.currentSrc || i.src).slice(0, 120)) }; })()`;
        let preview = null;
        for (let i = 0; i < 30 && !preview?.loaded; i++) { await sleep(200); preview = await browser.ev(previewExpr); }
        return { ok: v !== was && pathOf(v).startsWith(`${FOLDER}/`), url: v, preview: !!preview?.loaded, previewDetail: preview };
      }
      await openAbout();
      const ctrl = await browser.ev(`(() => { const d = document.querySelector('[role=dialog]'); return d ? { file: !!d.querySelector('input[type=file][accept="image/jpeg,image/png,image/webp"]'), others: d.querySelectorAll('input[type=file]').length } : null; })()`);
      check("UI1 the Home · About section editor has one image upload control (Photo only)", ctrl?.file && ctrl.others === 1, ctrl);
      const a = await choose(fileA);
      check("UI2 upload in the browser → filed in the reserved folder, with a preview", a.ok && a.preview, a);
      check("UI3 saved → dialog closes; homepage shows the uploaded photo", (await save()) && (await page("/")).html.includes(encodeURIComponent(a.url)));
      await openAbout();
      const b = await choose(fileB);
      const saved = await save();
      const f6 = await folder(FOLDER);
      check("UI4 replace in the browser → saved; only the new file remains", b.ok && saved && JSON.stringify(f6) === JSON.stringify([pathOf(b.url)]), { b, f6 });
      // Gallery UI: a reserved id (typed, or generated from the title) is refused BEFORE any upload request
      await browser.goto(BASE + "/admin/gallery", 1500);
      for (let i = 0; i < 50 && !(await browser.ev(`!!document.querySelector("main table")`)); i++) await sleep(200);
      await browser.ev(`(() => { window.__uploads = []; const f = window.fetch; window.fetch = (input, init) => { const u = String(input?.url ?? input); if (u.includes("/api/admin/uploads")) window.__uploads.push(u); return f(input, init); }; return true; })()`);
      const galleryUpload = async (fields) => {
        await browser.ev(`[...document.querySelectorAll("button")].find((b) => /^add /i.test(b.innerText.trim()))?.click(), true`);
        for (let i = 0; i < 40 && !(await dialogOpen()); i++) await sleep(150);
        for (const [k, v] of Object.entries(fields)) await browser.ev(`(() => { const el = document.querySelector('[role=dialog] [name="${k}"]'); if (!el) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ${JSON.stringify("")} + ${JSON.stringify(String(v))}); el.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
        const n0 = await browser.ev(`window.__uploads.length`);
        const doc = await browser.send("DOM.getDocument", { depth: -1 });
        const q = await browser.send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: `[role=dialog] input[type=file][aria-label="Upload Media URL"]` });
        if (!q.nodeId) return { ok: false, why: "no upload control" };
        await browser.send("DOM.setFileInputFiles", { files: [fileA], nodeId: q.nodeId });
        let url = ""; for (let i = 0; i < 25 && !url; i++) { await sleep(200); url = await browser.ev(`document.querySelector('[role=dialog] [name="url"]')?.value ?? ""`); if (await browser.ev(`/reserved for site content/i.test(document.querySelector('[role=dialog]')?.innerText ?? "")`)) break; }
        await sleep(500);
        const res = { requests: (await browser.ev(`window.__uploads.length`)) - n0, url, message: await browser.ev(`/This ID is reserved for site content\\./.test(document.querySelector('[role=dialog]')?.innerText ?? "")`) };
        await browser.ev(`[...document.querySelectorAll('[role=dialog] button')].find((b) => b.innerText.trim().toUpperCase() === "CANCEL")?.click(), true`);
        for (let i = 0; i < 40 && (await dialogOpen()); i++) await sleep(150);
        return res;
      };
      const contentBefore = await folder(FOLDER);
      const typed = await galleryUpload({ title: "QA Reserved", id: "content-home-about" });
      check("GU1 Gallery UI, ID typed as content-home-about: no upload request is made; the reserved-ID message is shown", typed.requests === 0 && typed.message && !typed.url, typed);
      const generated = await galleryUpload({ title: "Content Home About" });
      check("GU2 Gallery UI, ID generated from the title (content-home-about): no upload request is made; the message is shown", generated.requests === 0 && generated.message && !generated.url, generated);
      check("GU3 the reserved folder is unchanged by those attempts", JSON.stringify(await folder(FOLDER)) === JSON.stringify(contentBefore), { before: contentBefore, after: await folder(FOLDER) });
      const control = await galleryUpload({ title: "QA Content Media G3", id: "qa-content-media-g3" });
      check("GU4 control: an ordinary Gallery ID still uploads (exactly one request, filed under its own folder)", control.requests === 1 && pathOf(control.url).startsWith("gallery/qa-content-media-g3/") && !control.message, control);
      check("UI5 no page exceptions in the Admin UI", !browser.errors.some((e) => e.startsWith("exception")), browser.errors.slice(0, 3));
    } finally { rmSync(tmp, { recursive: true, force: true }); }

    section("restore");
    await restore();
    const after = (await http("GET", "/api/admin/content")).json?.data?.[SECTION];
    // field by field: the database stores the JSON object with its own key order
    const same = after && Object.keys(restoreData).length === Object.keys(after).length && Object.keys(restoreData).every((k) => after[k] === restoreData[k]);
    check("Z1 section restored (its previous saved data, or the built-in text with no photo)", same, { after, restoreData });
    check("Z2 the reserved folder is empty again", (await folder(FOLDER)).length === 0, await folder(FOLDER));
    const hz = await page("/");
    check("Z3 homepage About card is back as before", before ? true : hz.html.includes(PLACEHOLDER) && hz.html.includes("MORE THAN A CLUB."));
    const rowsLeft = ((await http("GET", "/api/admin/gallery")).json?.data ?? []).filter((x) => String(x.id).startsWith("qa-content-media-"));
    check("Z4 no qa-content-media-* Gallery records or files left", rowsLeft.length === 0 && (await folder("gallery/qa-content-media-g1")).length === 0 && (await folder("gallery/qa-content-media-g2")).length === 0 && (await folder("gallery/qa-content-media-g3")).length === 0, rowsLeft);
  }
} catch (e) {
  check(`suite aborted: ${String(e.message || e).slice(0, 300)}`, false);
} finally {
  if (MODE === "backend") { try { await restore(); await adminClient?.auth.signOut({ scope: "local" }); } catch {} }
  await browser?.close();
}
const failures = checks.filter((x) => !x.ok);
const out = join(ROOT, "qa/cms-content-media/results"); mkdirSync(out, { recursive: true });
const at = new Date().toISOString();
const file = join(out, `cms-content-media-${MODE}-${at.replace(/[:.]/g, "-")}.json`);
writeFileSync(file, scrub(JSON.stringify({ suite: "cms-content-media", mode: MODE, at, total: checks.length, passed: checks.length - failures.length, failures, checks }, null, 2)));
console.log(`\n${checks.length - failures.length}/${checks.length} passed (${MODE}) → ${file.slice(ROOT.length + 1)}`);
process.exit(failures.length ? 1 : 0);
