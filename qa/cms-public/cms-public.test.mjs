// Public About page ← CMS backend (Faculty + HOD): sophia-cms-staging ONLY, against a LOCAL server.
//   node qa/cms-public/cms-public.test.mjs --base http://localhost:3010                   (CMS_FACULTY_MODE=backend)
//   node qa/cms-public/cms-public.test.mjs --base http://localhost:3011 --expect-error    (backend mode, Supabase unreachable)
// Uses the existing admin API (Bearer) to change only its own qa-p3-* records, plus qa-hod-a (an existing test
// record that already has message history) for the HOD card; every changed field is restored at the end. One new
// archived message is added to qa-hod-a (messages are never deleted; same as the P2.2 suite).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { loadQaEnv, redact } from "../cms-db/lib/env.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg("base", "http://localhost:3010").replace(/\/$/, "");
const EXPECT_ERROR = process.argv.includes("--expect-error");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE)) { console.error("REFUSED: --base must be a local server."); process.exit(2); }
const env = loadQaEnv(ROOT);
const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok: !!ok, ...(ok || detail === undefined ? {} : { detail: redact(JSON.stringify(detail), env).slice(0, 600) }) }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : "  — " + redact(JSON.stringify(detail), env).slice(0, 300)}`); };

const STATIC_NAMES = [...readFileSync(join(ROOT, "src/data/staticFaculty.ts"), "utf8").matchAll(/^\s+name:\s*"([^"]+)"/gm)].map((m) => m[1]);
const STATIC_QUOTE = "The Ingenious Forum represents the best of our institution";
const about = async () => { const r = await fetch(BASE + "/about", { cache: "no-store" }); return { status: r.status, html: await r.text(), cc: r.headers.get("cache-control") ?? "" }; };
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const noStatic = (t) => STATIC_NAMES.every((n) => !t.includes(n)) && !t.includes(STATIC_QUOTE);

if (EXPECT_ERROR) {
  const a = await about(); const t = text(a.html);
  check("X1 backend unreachable: /about still renders (200)", a.status === 200, a.status);
  check("X2 faculty section shows the error state", t.includes("Faculty information is temporarily unavailable. Please try again later."));
  check("X3 no built-in (demo) faculty or principal text is substituted", noStatic(t));
  check("X4 the HOD card is not shown", !t.includes("A word from the"));
} else {
  const c = createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await c.auth.signInWithPassword({ email: env.adminEmail, password: env.adminPassword });
  if (s.error) throw new Error("admin sign-in failed");
  const H = { Authorization: `Bearer ${s.data.session.access_token}`, "Content-Type": "application/json" };
  const api = async (method, path, body) => { const r = await fetch(BASE + path, { method, headers: H, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, json: r.status === 204 ? null : await r.json().catch(() => null) }; };
  const list = async () => (await api("GET", "/api/admin/faculty")).json.data;
  const before = await list();
  const hodBefore = before.find((f) => f.id === "qa-hod-a");
  // HOD steps only when staging has no active HOD: a real HOD is never switched or cleared by tests
  const hodAllowed = !before.some((f) => f.isActiveHod) && !!hodBefore;
  try {
    check("S0 qa-hod-a exists (HOD checks run only when staging has no active HOD)", !!hodBefore);
    for (const f of before.filter((x) => x.id.startsWith("qa-p3-"))) await api("DELETE", `/api/admin/faculty/${f.id}`);

    let a = await about(), t = text(a.html);
    const anyPublished = before.some((f) => f.isPublished);
    check("P0 backend mode: /about is rendered per request (no-store), 200", a.status === 200 && /no-store/.test(a.cc), { status: a.status, cc: a.cc });
    check("P1 no built-in (INGENIOUS/GWCET) faculty or principal text in backend mode", noStatic(t));
    check("P2 empty state: with no published faculty the section is not shown", anyPublished || !t.includes("OUR MENTORS"));
    if (hodAllowed) check("P3 no HOD → no message card", !t.includes("A word from the"));

    await api("POST", "/api/admin/faculty", { id: "qa-p3-pub", name: "QA P3 Public", designation: "QA Designation", sortOrder: 1, isPublished: true, quote: "QA public quote.", linkedin: "https://www.linkedin.com/in/qa-p3" });
    await api("POST", "/api/admin/faculty", { id: "qa-p3-draft", name: "QA P3 Draft", designation: "QA", sortOrder: 2, isPublished: false });
    a = await about(); t = text(a.html);
    check("P4 a published record appears with its designation, quote and LinkedIn", t.includes("OUR MENTORS") && t.includes("QA P3 Public") && t.includes("QA Designation") && t.includes("QA public quote.") && a.html.includes("https://www.linkedin.com/in/qa-p3"));
    check("P5 an unpublished record does not appear", !t.includes("QA P3 Draft"));
    await api("PATCH", "/api/admin/faculty/qa-p3-pub", { name: "QA P3 Renamed" });
    t = text((await about()).html);
    check("P6 an Admin edit shows on the next request (no rebuild)", t.includes("QA P3 Renamed") && !t.includes("QA P3 Public"));
    await api("PATCH", "/api/admin/faculty/qa-p3-draft", { isPublished: true });
    t = text((await about()).html);
    check("P7 publishing in Admin makes the record appear, in sort order", t.includes("QA P3 Draft") && t.indexOf("QA P3 Renamed") < t.indexOf("QA P3 Draft"));

    // HOD card: qa-hod-a (existing test record) published + active HOD + a published message
    if (!hodAllowed) { for (const n of ["H1", "H2", "H3"]) check(`${n} HOD card (NOT RUN: staging has a real active HOD; tests never switch or clear it)`, false); }
    else {
    await api("PATCH", "/api/admin/faculty/qa-hod-a", { isPublished: true });
    await api("POST", "/api/admin/hod", { facultyId: "qa-hod-a" });
    const m = await api("POST", "/api/admin/hod-messages", { facultyId: "qa-hod-a", message: "QA approved HOD message." });
    t = text((await about()).html);
    check("H1 active HOD with only a draft message → no card", !t.includes("A word from the") && !t.includes("QA approved HOD message."));
    // workflow: approve (with the approver and date), then publish
    await api("PATCH", `/api/admin/hod-messages/${m.json?.data?.id}`, { status: "approved", approvedBy: "QA approver", approvedOn: "2026-11-01" });
    const pub = await api("PATCH", `/api/admin/hod-messages/${m.json?.data?.id}`, { status: "published" });
    t = text((await about()).html);
    check("H2 published message → card with the HOD's name, designation and the exact message", pub.status === 200 && t.includes("A word from the Head of Department") && t.includes("QA approved HOD message.") && t.includes(hodBefore.name), { pub: pub.status });
    await api("PATCH", `/api/admin/hod-messages/${m.json?.data?.id}`, { status: "archived" });
    t = text((await about()).html);
    check("H3 archived message → card gone", !t.includes("A word from the"));
    }
  } finally {
    if (hodAllowed) {
      await api("DELETE", "/api/admin/hod");
      await api("PATCH", "/api/admin/faculty/qa-hod-a", { isPublished: hodBefore.isPublished });
    }
    for (const id of ["qa-p3-pub", "qa-p3-draft"]) await api("DELETE", `/api/admin/faculty/${id}`);
    const after = await list();
    const strip = (rows) => JSON.stringify(rows.filter((f) => !f.id.startsWith("qa-p3-")).map(({ updatedAt, ...r }) => r));
    check("Z1 staging restored: same records and fields as before (no qa-p3-*, no HOD, qa-hod-a unpublished again)", strip(after) === strip(before) && !after.some((f) => f.id.startsWith("qa-p3-")), { before: strip(before), after: strip(after) });
    const tz = text((await about()).html);
    check("Z2 /about back to its starting state (no test names; the card as before)", !tz.includes("QA P3") && (!hodAllowed || !tz.includes("A word from the")));
    await c.auth.signOut({ scope: "local" });
  }
}

const failures = checks.filter((x) => !x.ok);
const out = join(ROOT, "qa/cms-public/results"); mkdirSync(out, { recursive: true });
const at = new Date().toISOString();
const file = join(out, `cms-public-${EXPECT_ERROR ? "error" : "backend"}-${at.replace(/[:.]/g, "-")}.json`);
writeFileSync(file, JSON.stringify({ suite: "cms-public", mode: EXPECT_ERROR ? "error" : "backend", at, total: checks.length, passed: checks.length - failures.length, failures, checks }, null, 2));
console.log(`\n${checks.length - failures.length}/${checks.length} passed → ${file.slice(ROOT.length + 1)}`);
process.exit(failures.length ? 1 : 0);
