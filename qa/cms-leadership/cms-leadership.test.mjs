// Institutional leadership on About (faculty records with reserved ids leadership-*): sophia-cms-staging ONLY, LOCAL server.
//   node qa/cms-leadership/cms-leadership.test.mjs --mode backend --base http://localhost:3010
//   node qa/cms-leadership/cms-leadership.test.mjs --mode demo    --base http://localhost:3000
// Works only on its own leadership-qa-* records and one same-name ordinary record qa-leader-dup (created, edited through
// the real Admin UI, then deleted with their photos). The real leadership profiles are only read (they must exist with
// their seeded name and designation; published or not is the owner's choice).
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
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
const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok: !!ok, ...(ok || detail === undefined ? {} : { detail: redact(JSON.stringify(detail), env).slice(0, 1000) }) }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : "  — " + redact(JSON.stringify(detail), env).slice(0, 400)}`); };
const section = (t) => console.log(`\n== ${t}`);
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ");
const aboutHtml = async () => (await fetch(BASE + "/about", { cache: "no-store" })).text();
const REAL = [["leadership-principal", "Dr. S. A. Dhale", "Principal"], ["leadership-vice-principal", "Dr. G. M. Asutkar", "Vice Principal"], ["leadership-student-dean", "Dr. V. K. Taksande", "Student Dean Affairs"]];
const QA = [["leadership-qa-a", "QA Leader A", "QA Principal"], ["leadership-qa-b", "QA Leader B", "QA Vice Principal"], ["leadership-qa-c", "QA Leader C", "QA Dean"]];

const browser = await launch(9680);
let A = null, client = null;
const api = async (method, path, body) => { const r = await fetch(BASE + path, { method, headers: { Authorization: `Bearer ${A}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: r.status === 204 ? null : await r.json().catch(() => null) }; };
const ev = (x) => browser.ev(x);
const waitFor = async (expr, ms = 15000) => { const end = Date.now() + ms; let v; while (Date.now() < end) { try { v = await ev(expr); if (v) return v; } catch {} await sleep(150); } return v; };
const setVal = (name, v) => ev(`(() => { const el = document.querySelector('[role=dialog] [name="${name}"]'); if (!el) return false; const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(String(v))}); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
const clickText = (t) => ev(`(() => { const want = ${JSON.stringify(t.toLowerCase())}; const b = [...document.querySelectorAll("button")].find((x) => x.innerText.trim().toLowerCase() === want || (x.getAttribute("aria-label") || "").toLowerCase() === want); if (!b) return false; b.click(); return true; })()`);
async function cleanup() {
  if (!A) return;
  for (const [id] of QA) await api("DELETE", `/api/admin/faculty/${id}`);   // deletion also empties the photo folder
  await api("DELETE", "/api/admin/faculty/qa-leader-dup");
}

try {
  if (MODE === "demo") {
    section("demo mode");
    const t = text(await aboutHtml());
    check("DM1 About has no institutional authorities section in demo mode (no built-in data)", !t.includes("INSTITUTIONAL AUTHORITIES"));
    check("DM2 the former college principal card (GWCET quote and photo) is gone", !t.includes("A word from the Principal") && !t.includes("Dr. Salim A. Chavan") && !t.includes("Ingenious Forum represents"));
    check("DM3 the rest of About is unchanged (faculty grid, pillars, milestones)", t.includes("OUR MENTORS") && t.includes("MISSION") && t.includes("1990"));
  } else {
    const c = createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } });
    const s = await c.auth.signInWithPassword({ email: env.adminEmail, password: env.adminPassword });
    if (s.error) throw new Error("admin sign-in failed"); A = s.data.session.access_token; client = c;
    await cleanup();

    section("seeded profiles (read only)");
    const all = (await api("GET", "/api/admin/faculty")).json?.data ?? [];
    for (const [id, name, designation] of REAL) {
      const r = all.find((f) => f.id === id);
      check(`R ${id}: exists as "${name}, ${designation}" (exact)`, r && r.name === name && r.designation === designation, r);
    }

    section("setup: three QA leadership profiles (photos uploaded and published through the UI below)");
    for (const [i, [id, name, designation]] of QA.entries()) await api("POST", "/api/admin/faculty", { id, name, designation, department: "QA", sortOrder: 100 + i, isPublished: false });
    await api("POST", "/api/admin/faculty", { id: "qa-leader-dup", name: "QA Leader A", designation: "QA ordinary faculty card", sortOrder: 99, isPublished: true });
    const gridOf = (h) => { const a = h.indexOf("faculty-heading"); return a < 0 ? "" : text(h.slice(a, h.indexOf("</section>", a))); };
    check("D0 before its authority profile is published, a same-name ordinary faculty record shows in the Faculty grid", gridOf(await aboutHtml()).includes("QA ordinary faculty card"));

    section("Admin (real browser): separate leadership table; edit, upload a photo, publish");
    await browser.viewport("desktop");
    await browser.goto(BASE + "/login?next=%2Fadmin%2Ffaculty", 1500);
    await ev(`(() => { const set = (s, v) => { const el = document.querySelector(s); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); }; set("main input[type=email]", ${JSON.stringify(env.adminEmail)}); set("main input[type=password]", ${JSON.stringify(env.adminPassword)}); document.querySelector("main button[type=submit]").click(); return true; })()`);
    const ready = await waitFor(`location.pathname === "/admin/faculty" && !!document.querySelector('[aria-labelledby="leadership-admin-heading"] table')`, 25000);
    check("B0 the Faculty Manager has an 'Institutional leadership' table", !!ready);
    const tables = await ev(`(() => { const rows = (t) => [...(t?.querySelectorAll("tbody tr") ?? [])].map((r) => r.innerText.replace(/\\s+/g, " ").trim()); const sec = document.querySelector('[aria-labelledby="leadership-admin-heading"]'); return { faculty: rows(document.querySelector("table")), leadership: rows(sec.querySelector("table")), leadAdd: [...sec.querySelectorAll("button")].some((b) => /^add /i.test(b.innerText.trim())), leadDelete: !!sec.querySelector('button[aria-label^="Delete "]') }; })()`);
    check("B1 leadership profiles are listed only in their own table (not in the faculty table)", REAL.every(([, n]) => tables.leadership.some((r) => r.includes(n))) && QA.every(([, n]) => tables.leadership.some((r) => r.includes(n))) && !tables.faculty.some((r) => /QA Leader|Dr\. S\. A\. Dhale|Dr\. V\. K\. Taksande/.test(r) && !r.includes("QA ordinary faculty card")), tables);
    check("B2 the leadership table has no Add or Delete (three fixed profiles)", !tables.leadAdd && !tables.leadDelete, tables);
    await waitFor(`!!document.querySelector('[aria-labelledby="hod-messages-heading"] table')`, 15000);   // the HOD section loads separately
    await clickText("ADD HOD MESSAGE"); await waitFor(`!!document.querySelector('[role=dialog] [name="facultyId"]')`, 5000);
    const hodOpts = await ev(`[...(document.querySelector('[role=dialog] [name="facultyId"]')?.options ?? [])].map((o) => o.value)`);
    check("B3 leadership profiles can't be chosen for a HOD message", hodOpts.length > 0 && !hodOpts.some((v) => v.startsWith("leadership-")), hodOpts);
    await clickText("CANCEL"); await sleep(300);

    const sharp = createRequire(join(ROOT, "package.json"))("sharp");
    const tmp = join(tmpdir(), `qa-leadership-${Date.now()}`); mkdirSync(tmp, { recursive: true });
    try {
      for (const [i, [, name]] of QA.entries()) {
        const file = join(tmp, `${i}.png`);
        writeFileSync(file, await sharp({ create: { width: 160, height: 200, channels: 3, background: { r: 40 + i * 70, g: 90, b: 200 - i * 50 } } }).png().toBuffer());
        // inside the leadership table: the same-name ordinary record (qa-leader-dup) has its own Edit button in the faculty table
        await ev(`(() => { const want = ${JSON.stringify(`edit ${name}`.toLowerCase())}; const b = [...document.querySelectorAll('[aria-labelledby="leadership-admin-heading"] button')].find((x) => x.innerText.trim().toLowerCase() === want || (x.getAttribute("aria-label") || "").toLowerCase() === want); if (!b) return false; b.click(); return true; })()`); await sleep(400);
        const names = await ev(`[...document.querySelectorAll('[role=dialog] [name]')].map((e) => e.getAttribute("name"))`);
        if (i === 0) check("B4 the leadership form edits name, designation, photo (+ permission), order and published — no HOD, quote or bio", JSON.stringify(names) === '["name","designation","image","imageConsent","sortOrder","isPublished"]', names);
        if (i === 0) await setVal("designation", "QA Principal (edited)");
        const doc = await browser.send("DOM.getDocument", { depth: -1 });
        const q = await browser.send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: '[role=dialog] input[type=file][aria-label="Upload Photo"]' });
        await browser.send("DOM.setFileInputFiles", { files: [file], nodeId: q.nodeId });
        let v = ""; for (let k = 0; k < 75 && !v.includes("/site-media/faculty/"); k++) { await sleep(200); v = await ev(`document.querySelector('[role=dialog] [name="image"]')?.value ?? ""`); }
        await setVal("imageConsent", "QA test image (no real person)");
        await ev(`(() => { const el = document.querySelector('[role=dialog] [name="isPublished"]'); if (!el.checked) el.click(); return true; })()`);
        await ev(`document.querySelector('[role=dialog] button[type=submit]').click(), true`);
        for (let k = 0; k < 75 && (await ev(`!!document.querySelector('[role=dialog]')`)); k++) await sleep(200);
        if (i === 0) check("B5 photo uploaded in the browser and saved with the profile", v.includes(`/site-media/faculty/${QA[0][0]}/`) && !(await ev(`!!document.querySelector('[role=dialog]')`)), v);
      }
    } finally { rmSync(tmp, { recursive: true, force: true }); }
    const stored = ((await api("GET", "/api/admin/faculty")).json?.data ?? []).filter((f) => f.id.startsWith("leadership-qa-"));
    check("B6 the three QA profiles are published with photos; the edit is stored", stored.length === 3 && stored.every((f) => f.isPublished && f.image.includes("/site-media/faculty/")) && stored.find((f) => f.id === "leadership-qa-a")?.designation === "QA Principal (edited)", stored.map((f) => [f.id, f.isPublished, !!f.image, f.designation]));

    section("public About: a separate leadership section");
    const html = await aboutHtml(), t = text(html);
    const iLead = t.indexOf("INSTITUTIONAL AUTHORITIES"), iFac = t.indexOf("OUR MENTORS");
    const grid = (() => { const a = html.indexOf("faculty-heading"); return a < 0 ? "" : text(html.slice(a, html.indexOf("</section>", a))); })();
    check("D1 once the authority profile is published, the same person is NOT also shown as a Faculty card (no duplicate)", !grid.includes("QA ordinary faculty card") && t.includes("QA Principal (edited)"));
    check("P1 the section appears with the heading 'Institutional Authorities', after the Faculty section", iLead > 0 && (iFac < 0 || iFac < iLead), { iLead, iFac });
    check("P2 it shows the published profiles' names and designations (the edit shows on the next request, no rebuild)", QA.every(([, n]) => t.includes(n)) && t.includes("QA Principal (edited)") && t.includes("QA Dean"));
    // real profiles (read only): shown in the authorities section exactly when the owner has published them, never in the grid
    const leadText = text(html.slice(html.indexOf("leadership-heading"), html.indexOf("</section>", html.indexOf("leadership-heading"))));
    const realNow = ((await api("GET", "/api/admin/faculty")).json?.data ?? []).filter((f) => f.id.startsWith("leadership-") && !f.id.startsWith("leadership-qa-"));
    check("P3 real authority profiles appear in the authorities section exactly when published", realNow.every((f) => leadText.includes(f.name) === f.isPublished), realNow.map((f) => [f.id, f.isPublished, leadText.includes(f.name)]));
    check("P3b no published authority (real or QA) appears in the Faculty grid", [...realNow.filter((f) => f.isPublished).map((f) => f.name), ...QA.map(([, n]) => n)].every((n) => !grid.includes(n)), grid.slice(0, 300));
    check("P4 leadership profiles are not in the Faculty grid", (() => { const a = html.indexOf("faculty-heading"); if (a < 0) return true; const grid = html.slice(a, html.indexOf("leadership-heading")); return QA.every(([, n]) => !grid.includes(n)); })());
    check("P5 no old college principal card or quote", !t.includes("A word from the Principal") && !t.includes("Ingenious Forum represents"));

    for (const [vp, label] of [["desktop", "desktop: one row of three equal columns"], ["mobile", "mobile: stacked"]]) {
      await browser.viewport(vp);
      await browser.goto(BASE + "/about", 1500);
      await ev(`document.getElementById("leadership-heading")?.scrollIntoView(), true`); await sleep(1500);
      // the three QA cards (with photos); real profiles the owner has published may sit beside them in the same row
      const layout = await ev(`[...document.querySelectorAll('[aria-labelledby="leadership-heading"] li')].filter((li) => /QA Leader/.test(li.innerText)).map((li) => { const r = li.getBoundingClientRect(); const img = li.querySelector("img"); return { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), loaded: !!img && img.complete && img.naturalWidth > 0 }; })`);
      const sameRow = layout.length === 3 && layout.every((x) => Math.abs(x.top - layout[0].top) <= 2) && layout[0].left < layout[1].left && layout[1].left < layout[2].left && Math.abs(layout[0].w - layout[2].w) <= 2;
      const stacked = layout.length === 3 && layout[0].top < layout[1].top && layout[1].top < layout[2].top && layout.every((x) => Math.abs(x.left - layout[0].left) <= 2);
      check(`L ${label}; photos loaded in the browser`, (vp === "desktop" ? sameRow : stacked) && layout.every((x) => x.loaded), layout);
    }
    await browser.viewport("desktop");
    check("L3 no page exceptions", !browser.errors.some((e) => e.startsWith("exception")), browser.errors.slice(0, 3));
  }
} catch (e) {
  check(`suite aborted: ${String(e.message || e).slice(0, 300)}`, false);
} finally {
  if (MODE === "backend" && A) {
    await cleanup();
    const left = ((await api("GET", "/api/admin/faculty")).json?.data ?? []).filter((f) => f.id.startsWith("leadership-qa-"));
    const files = [];
    for (const [id] of QA) files.push(...(((await client.storage.from("site-media").list(`faculty/${id}`)).data) ?? []));
    check("Z1 QA leadership records and their photo files removed; About shows no QA profile", left.length === 0 && files.length === 0 && !text(await aboutHtml()).includes("QA Leader"), { left: left.map((f) => f.id), files: files.length });
    await client.auth.signOut({ scope: "local" });
  }
  await browser.close();
}
const failures = checks.filter((x) => !x.ok);
const out = join(ROOT, "qa/cms-leadership/results"); mkdirSync(out, { recursive: true });
const at = new Date().toISOString();
const file = join(out, `cms-leadership-${MODE}-${at.replace(/[:.]/g, "-")}.json`);
writeFileSync(file, redact(JSON.stringify({ suite: "cms-leadership", mode: MODE, at, total: checks.length, passed: checks.length - failures.length, failures, checks }, null, 2), env));
console.log(`\n${checks.length - failures.length}/${checks.length} passed (${MODE}) → ${file.slice(ROOT.length + 1)}`);
process.exit(failures.length ? 1 : 0);
