// Sophia CMS P2.1/P2.2 API security tests: sophia-cms-staging ONLY, against a LOCAL Next.js server.
//   node qa/cms-api/cms-api.test.mjs --base http://localhost:3000 --expect off   (default flags: every route 404)
//   node qa/cms-api/cms-api.test.mjs --base http://localhost:3010 --expect on    (server started with CMS_FACULTY_MODE=backend)
// Credentials come from .env.test.local (qa/cms-db/lib/env.mjs refuses anything but staging and never prints values).
// The server's own .env.local must also point at staging. Test records use the "qa-api-" prefix; records with
// message history can't be deleted through the API (D2) and stay in staging for the owner's clean-up decision.
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { createClient } from "@supabase/supabase-js";
import { loadQaEnv, redact, STAGING_REF } from "../cms-db/lib/env.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const BASE = arg("base", "http://localhost:3000").replace(/\/$/, "");
const EXPECT = arg("expect", "off");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE)) { console.error("REFUSED: --base must be a local server."); process.exit(2); }
if (!["off", "on"].includes(EXPECT)) { console.error("REFUSED: --expect must be off or on."); process.exit(2); }

const env = loadQaEnv(ROOT);
const appRef = readFileSync(join(ROOT, ".env.local"), "utf8").match(/NEXT_PUBLIC_SUPABASE_URL\s*=\s*https:\/\/([a-z0-9]{20})\.supabase\.co/)?.[1];
if (appRef !== STAGING_REF) { console.error("REFUSED: the server's .env.local does not point at sophia-cms-staging."); process.exit(2); }

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok: !!ok, ...(ok || detail === undefined ? {} : { detail: redact(JSON.stringify(detail), env).slice(0, 300) }) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : "  — " + redact(JSON.stringify(detail), env).slice(0, 240)}`);
};
const section = (t) => console.log(`\n== ${t}`);
let noStoreViolations = 0, responses = 0, frameworkResponses = 0;

async function call(method, path, { token, body, headers = {}, rawBody, origin = BASE } = {}) {
  const h = { ...headers };
  if (origin) h.Origin = origin;
  if (token) h.Authorization = `Bearer ${token}`;
  let payload;
  if (rawBody !== undefined) payload = rawBody;
  else if (body !== undefined) { payload = JSON.stringify(body); h["Content-Type"] ??= "application/json"; }
  const r = await fetch(BASE + path, { method, headers: h, body: payload, redirect: "manual" });
  // Next.js answers unexported methods itself (405, empty body) before any handler runs; counted separately
  if (r.status === 405) frameworkResponses++;
  else { responses++; if (!/no-store/.test(r.headers.get("cache-control") ?? "")) noStoreViolations++; }
  let json = null; try { json = r.status === 204 ? null : await r.json(); } catch {}
  return { status: r.status, json, headers: r.headers };
}

// ---------------------------------------------------------------- offline checks (no server needed)
section("offline: flags and module boundaries");
{
  const ts = createRequire(join(ROOT, "package.json"))("typescript");
  const out = join(tmpdir(), `cms-mode-${Date.now()}.mjs`);
  writeFileSync(out, ts.transpileModule(readFileSync(join(ROOT, "src/lib/cms/mode.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
  const M = await import(pathToFileURL(out).href);
  const run = (auth, faculty) => { const keep = { a: process.env.CMS_AUTH_MODE, f: process.env.CMS_FACULTY_MODE };
    if (auth === undefined) delete process.env.CMS_AUTH_MODE; else process.env.CMS_AUTH_MODE = auth;
    if (faculty === undefined) delete process.env.CMS_FACULTY_MODE; else process.env.CMS_FACULTY_MODE = faculty;
    const r = [M.cmsAuthMode(), M.cmsFacultyMode()];
    if (keep.a === undefined) delete process.env.CMS_AUTH_MODE; else process.env.CMS_AUTH_MODE = keep.a;
    if (keep.f === undefined) delete process.env.CMS_FACULTY_MODE; else process.env.CMS_FACULTY_MODE = keep.f;
    return r.join("/"); };
  check("F1 both flags default to demo when unset", run(undefined, undefined) === "demo/demo");
  check("F2 empty, mis-cased or unknown values fall back to demo", ["", "BACKEND", "Supabase", "yes", "1", " backend"].every((v) => run(v, v) === "demo/demo"));
  check("F3 only the exact values switch modes", run("supabase", "backend") === "supabase/backend");
  const walk = (d, acc = []) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p, acc) : acc.push(p); } return acc; };
  const clientImports = walk(join(ROOT, "src")).filter((f) => /\.(tsx?|jsx?)$/.test(f)).filter((f) => { const s = readFileSync(f, "utf8"); return /^\s*["']use client["']/.test(s) && /@\/lib\/cms|lib\/cms\//.test(s); });
  check("F4 no client component imports src/lib/cms (server-only code)", clientImports.length === 0, clientImports);
  // code only (comments removed by the compiler), so documentation that *mentions* the demo cookie doesn't count
  const cmsCode = walk(join(ROOT, "src/lib/cms")).map((f) => ts.transpileModule(readFileSync(f, "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, removeComments: true } }).outputText).join("\n");
  const codeHits = cmsCode.replace(/key\.startsWith\("sb_secret_"\)/g, "").match(/SERVICE_ROLE|SECRET_KEY|service_role|sb_secret_|sophia_demo_session|demoAuth|demoStore/g) ?? [];
  check("F5 src/lib/cms code never uses a secret/service-role key, the demo cookie or the demo modules (only the sb_secret_ refusal guard)", codeHits.length === 0, codeHits);
  const envRead = [...new Set([...cmsCode.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]))].sort();
  check(`F7 src/lib/cms reads only the four allowed environment variables (${envRead.join(", ")})`, JSON.stringify(envRead) === JSON.stringify(["CMS_AUTH_MODE", "CMS_FACULTY_MODE", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_URL"]), envRead);
  const importers = walk(join(ROOT, "src")).filter((f) => /\.(tsx?)$/.test(f) && !f.includes(`${join("src", "lib", "cms")}`)).filter((f) => /@\/lib\/cms/.test(readFileSync(f, "utf8")));
  // server-side importers only (P2.3 adds the auth routes, the middleware, the root layout and the login page metadata;
  // P2.4 the admin layout, which passes the Faculty Manager mode on; the About server components that read published data)
  const SERVER_IMPORTERS = ["/src/app/api/admin/", "/src/app/api/auth/", "/src/middleware.ts", "/src/app/layout.tsx", "/src/app/login/page.tsx", "/src/app/admin/layout.tsx", "/src/components/about/FacultyGrid.tsx", "/src/components/about/PrincipalCard.tsx", "/src/components/about/LeadershipSection.tsx", "/src/lib/siteData.ts"];
  check("F6 only server-side files (API routes, middleware, root and admin layouts, login page, About server components) import src/lib/cms", importers.every((f) => SERVER_IMPORTERS.some((p) => f.replace(/\\/g, "/").includes(p))), importers);

  // ---------------------------------------------------------------- unit regressions on the real modules
  section("offline: date validation, error mapping, streamed body limit");
  const tmpMods = join(tmpdir(), `cms-mods-${Date.now()}`);
  mkdirSync(tmpMods, { recursive: true });
  for (const f of ["validation", "media-path", "faculty"]) {
    const js = ts.transpileModule(readFileSync(join(ROOT, `src/lib/cms/${f}.ts`), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    writeFileSync(join(tmpMods, `${f}.mjs`), js.replace(/from "\.\/validation"/g, 'from "./validation.mjs"').replace(/from "\.\/media-path"/g, 'from "./media-path.mjs"'));
  }
  const V = await import(pathToFileURL(join(tmpMods, "validation.mjs")).href);
  const FAC = await import(pathToFileURL(join(tmpMods, "faculty.mjs")).href);
  const valid = ["2026-11-01", "2024-02-29", "2000-02-29", "1900-01-01", "2026-12-31", "9999-12-31"];
  const invalid = ["2026-02-30", "2026-04-31", "2023-02-29", "1900-02-29", "2100-02-29", "2026-13-01", "2026-00-10", "2026-01-00", "0000-01-01", "1899-12-31", "2026-1-1", "01/11/2026", "2026-02-28T00:00", " 2026-02-28", ""];
  check(`U1 real calendar dates accepted (${valid.join(", ")})`, valid.every((d) => V.isCalendarDate(d)), valid.filter((d) => !V.isCalendarDate(d)));
  check(`U2 impossible or malformed dates rejected (${invalid.length} cases incl. 2026-02-30, 2023-02-29, 1900-02-29)`, invalid.every((d) => !V.isCalendarDate(d)), invalid.filter((d) => V.isCalendarDate(d)));
  const msg = (approvedOn) => V.validateMessageInput({ approvedOn }, "update");
  check("U3 validateMessageInput: 2026-02-30 → errors.approvedOn; 2024-02-29 → accepted", msg("2026-02-30").ok === false && !!msg("2026-02-30").errors.approvedOn && msg("2024-02-29").ok === true);
  for (const code of ["22007", "22008"]) {
    const m = FAC.mapDbError({ code, message: "date/time field value out of range", details: "", hint: "" }, "message");
    check(`U4 mapDbError ${code} (message) → 400 errors.approvedOn, not 500`, m.status === 400 && !!m.body.errors?.approvedOn, m);
    const f = FAC.mapDbError({ code, message: "x", details: "", hint: "" }, "faculty");
    check(`U5 mapDbError ${code} (other contexts) → 400 without leaking the database text`, f.status === 400 && !JSON.stringify(f.body).includes("x\""), f);
  }
  const unchanged = [
    [{ code: "23505", message: 'duplicate key value violates unique constraint "faculty_pkey"' }, "faculty", 409, "id"],
    [{ code: "23505", message: 'duplicate key value violates unique constraint "hod_messages_one_published"' }, "message", 409, "status"],
    [{ code: "23514", message: 'violates check constraint "faculty_linkedin_check"' }, "faculty", 400, "linkedin"],
    [{ code: "23514", message: 'violates check constraint "hod_messages_approval_required"' }, "message", 400, "approvedBy"],
  ];
  check("U6 existing error mappings unchanged (23505 id/status, 23514 linkedin/approvedBy)", unchanged.every(([e, ctx, s, field]) => { const r = FAC.mapDbError({ details: "", hint: "", ...e }, ctx); return r.status === s && !!r.body.errors?.[field]; }));
  const unknown = FAC.mapDbError({ code: "XX000", message: "secret internal detail", details: "", hint: "" }, "faculty");
  check("U7 unmapped database errors → 500 with a generic message (no internals)", unknown.status === 500 && !JSON.stringify(unknown.body).includes("secret"), unknown);

  // streamed bodies: count how many chunks the reader actually pulls
  const streamed = (chunkBytes, chunks, headers = {}) => {
    let pulled = 0;
    const body = new ReadableStream({ pull(ctl) { if (pulled >= chunks) return ctl.close(); pulled++; ctl.enqueue(new Uint8Array(chunkBytes).fill(0x20)); } });
    const req = new Request("http://localhost/x", { method: "POST", body, duplex: "half", headers: { "Content-Type": "application/json", ...headers } });
    return { req, pulled: () => pulled };
  };
  const big = streamed(8 * 1024, 1000);   // up to ~8 MB offered, no Content-Length
  const r1 = await V.readJsonBody(big.req);
  check(`U8 streamed body without Content-Length over 32 KB → 413, reading stopped early (${big.pulled()} of 1000 chunks pulled)`, r1.ok === false && r1.status === 413 && big.pulled() <= 8, { r1, pulled: big.pulled() });
  const lie = streamed(8 * 1024, 1000, { "Content-Length": "10" });
  const r2 = await V.readJsonBody(lie.req).catch((e) => ({ ok: false, status: "threw: " + e.message }));
  check("U9 streamed body with a false (small) Content-Length → 413, not fully read", r2.ok === false && (r2.status === 413 || String(r2.status).startsWith("threw")) && lie.pulled() <= 8, { r2, pulled: lie.pulled() });
  const declared = streamed(8 * 1024, 1000, { "Content-Length": String(40 * 1024) });
  const r3 = await V.readJsonBody(declared.req);
  check(`U10 declared Content-Length over 32 KB → 413 before reading (${declared.pulled()} chunks pulled)`, r3.ok === false && r3.status === 413 && declared.pulled() <= 1, { r3, pulled: declared.pulled() });
  const okBody = new Request("http://localhost/x", { method: "POST", duplex: "half", headers: { "Content-Type": "application/json" }, body: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{"name":')); c.enqueue(new TextEncoder().encode('"QA"}')); c.close(); } }) });
  const r4 = await V.readJsonBody(okBody);
  check("U11 a small streamed body (multiple chunks, no Content-Length) is read and parsed", r4.ok === true && r4.body.name === "QA", r4);
  const badUtf8 = new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json" }, body: new Uint8Array([0x7b, 0x22, 0xff, 0x22, 0x7d]) });
  const r5 = await V.readJsonBody(badUtf8);
  check("U12 invalid UTF-8 → 400", r5.ok === false && r5.status === 400, r5);
}

// ---------------------------------------------------------------- sign in (staging admin)
const sb = (persist = false) => createClient(env.url, env.key, { auth: { persistSession: persist, autoRefreshToken: false, detectSessionInUrl: false } });
const admin = sb();
const signed = await admin.auth.signInWithPassword({ email: env.adminEmail, password: env.adminPassword });
if (signed.error) { check("staging test admin can sign in", false, signed.error.message); process.exit(1); }
const TOKEN = signed.data.session.access_token;

const MSG_UUID = "00000000-0000-4000-8000-000000000000";
const ROUTES = [
  ["GET", "/api/admin/faculty"], ["POST", "/api/admin/faculty", { id: "qa-api-x", name: "x", designation: "x", sortOrder: 1 }],
  ["PATCH", "/api/admin/faculty/qa-api-x", { designation: "x" }], ["DELETE", "/api/admin/faculty/qa-api-x"],
  ["POST", "/api/admin/hod", { facultyId: "qa-api-x" }], ["DELETE", "/api/admin/hod"],
  ["GET", "/api/admin/hod-messages"], ["POST", "/api/admin/hod-messages", { facultyId: "qa-api-x", message: "x" }],
  ["PATCH", `/api/admin/hod-messages/${MSG_UUID}`, { message: "x" }],
];

if (EXPECT === "off") {
  section("default flags: the CMS API is off");
  const res = await Promise.all(ROUTES.map(([m, p, b]) => call(m, p, { token: TOKEN, body: b })));
  check(`O1 all ${ROUTES.length} route/method pairs return 404 even with a valid admin token (CMS_FACULTY_MODE unset → demo)`, res.every((r) => r.status === 404), res.map((r) => r.status));
  const anon = await Promise.all(ROUTES.map(([m, p, b]) => call(m, p, { body: b })));
  check("O2 and 404 without a token", anon.every((r) => r.status === 404), anon.map((r) => r.status));
} else {
  // ---------------------------------------------------------------- authentication matrix
  section("A. authentication: every route rejects non-admin callers");
  const parts = TOKEN.split(".");
  const flip = (s) => s.slice(0, -2) + (s.slice(-2) === "AA" ? "BB" : "AA");
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const fake = (claims) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}.${b64("not-a-signature")}`;
  const nowS = Math.floor(Date.now() / 1000);
  const revokedClient = sb();
  const second = await revokedClient.auth.signInWithPassword({ email: env.adminEmail, password: env.adminPassword });
  const REVOKED = second.data?.session?.access_token;
  await revokedClient.auth.signOut({ scope: "local" });
  check("A0 a second session was created and signed out for the revoked-token case", !!REVOKED && REVOKED !== TOKEN);
  const attackers = {
    "no credentials": {},
    "forged demo admin cookie": { headers: { Cookie: "sophia_demo_session=admin%7Cadmin%40demo.local" } },
    "forged Supabase auth cookie": { headers: { Cookie: `sb-${STAGING_REF}-auth-token=base64-${b64({ access_token: "x", refresh_token: "y" })}` } },
    "non-Bearer Authorization header": { headers: { Authorization: "Basic YWRtaW46YWRtaW4=" } },
    "garbage Bearer token": { token: "not-a-jwt" },
    "admin token with tampered signature": { token: `${parts[0]}.${parts[1]}.${flip(parts[2])}` },
    "fabricated admin JWT (wrong key)": { token: fake({ sub: signed.data.user.id, role: "authenticated", aud: "authenticated", exp: nowS + 3600, iat: nowS }) },
    "expired JWT": { token: fake({ sub: signed.data.user.id, role: "authenticated", aud: "authenticated", exp: nowS - 3600, iat: nowS - 7200 }) },
    "token of a signed-out (revoked) session": { token: REVOKED },
  };
  for (const [label, opts] of Object.entries(attackers)) {
    const res = await Promise.all(ROUTES.map(([m, p, b]) => call(m, p, { ...opts, body: b })));
    check(`A ${label}: all ${ROUTES.length} routes → 401`, res.every((r) => r.status === 401) && res.every((r) => r.json?.error && !r.json?.data), res.map((r) => r.status));
  }

  // ---------------------------------------------------------------- same-origin protection
  section("B. same-origin protection on writes");
  const writes = ROUTES.filter(([m]) => m !== "GET");
  const evil = await Promise.all(writes.map(([m, p, b]) => call(m, p, { token: TOKEN, body: b, origin: "https://evil.example" })));
  check(`B1 admin token + foreign Origin: all ${writes.length} writes → 403`, evil.every((r) => r.status === 403), evil.map((r) => r.status));
  const xsite = await Promise.all(writes.map(([m, p, b]) => call(m, p, { token: TOKEN, body: b, headers: { "Sec-Fetch-Site": "cross-site" } })));
  check("B2 admin token + Sec-Fetch-Site: cross-site: all writes → 403", xsite.every((r) => r.status === 403), xsite.map((r) => r.status));
  const noOrigin = await Promise.all(writes.map(([m, p, b]) => call(m, p, { body: b, origin: null })));
  check("B3 cookie-style write without Origin header: all writes → 403", noOrigin.every((r) => r.status === 403), noOrigin.map((r) => r.status));
  const gets = await Promise.all(ROUTES.filter(([m]) => m === "GET").map(([m, p]) => call(m, p, { token: TOKEN, origin: "https://evil.example" })));
  check("B4 reads are not origin-blocked (they change nothing)", gets.every((r) => r.status === 200), gets.map((r) => r.status));

  // ---------------------------------------------------------------- request hygiene
  section("C. request validation");
  const T = { token: TOKEN };
  check("C1 non-JSON content type → 415", (await call("POST", "/api/admin/faculty", { ...T, rawBody: "id=x", headers: { "Content-Type": "text/plain" } })).status === 415);
  check("C2 body over 32 KB → 413", (await call("POST", "/api/admin/faculty", { ...T, body: { id: "qa-api-big", name: "x".repeat(40000), designation: "x", sortOrder: 1 } })).status === 413);
  check("C3 invalid JSON → 400", (await call("POST", "/api/admin/faculty", { ...T, rawBody: "{not json", headers: { "Content-Type": "application/json" } })).status === 400);
  check("C4 JSON array body → 400", (await call("POST", "/api/admin/faculty", { ...T, body: [1, 2] })).status === 400);
  check("C5 unsupported method → 405", (await call("PUT", "/api/admin/faculty", { ...T, body: {} })).status === 405);

  // ---------------------------------------------------------------- admin behaviour
  section("D. faculty (admin)");
  for (const id of ["qa-api-a", "qa-api-b"]) await call("DELETE", `/api/admin/faculty/${id}`, T);   // tidy a previous run (records with history stay)
  const list = await call("GET", "/api/admin/faculty", T);
  // Since P2.5 the admin list includes imageConsent (the Faculty Manager edits it); never the editor or raw columns.
  // The public key can't read image_consent at all (database column grant, P1).
  check("D1 GET list → 200 with data array, no editor or raw database columns exposed", list.status === 200 && Array.isArray(list.json?.data) && list.json.data.every((r) => !("updatedBy" in r) && !("image_consent" in r) && !("image_path" in r) && !("updated_by" in r)), list.status);
  const created = await call("POST", "/api/admin/faculty", { ...T, body: { id: "qa-api-a", name: "QA API A", designation: "QA", sortOrder: 950, isPublished: true } });
  const existed = created.status === 409;   // qa-api-a may survive from a previous run (message history)
  if (existed) await call("PATCH", "/api/admin/faculty/qa-api-a", { ...T, body: { name: "QA API A", designation: "QA", sortOrder: 950, isPublished: true } });
  check("D2 create → 201 in the FacultyMember shape (dept default AI & DS, image \"\", not HOD)", existed || (created.status === 201 && created.json.data.department === "Artificial Intelligence & Data Science" && created.json.data.image === "" && created.json.data.isActiveHod === false && created.json.data.isPublished === true), created.json);
  const b = await call("POST", "/api/admin/faculty", { ...T, body: { id: "qa-api-b", name: "QA API B", designation: "QA", sortOrder: 951 } });
  check("D3 create unpublished → 201, isPublished false by default", b.status === 201 && b.json.data.isPublished === false, b.json);
  const dup = await call("POST", "/api/admin/faculty", { ...T, body: { id: "qa-api-b", name: "x", designation: "x", sortOrder: 1 } });
  check("D4 duplicate id → 409 with errors.id", dup.status === 409 && !!dup.json?.errors?.id, dup.json);
  const bad = await call("POST", "/api/admin/faculty", { ...T, body: { id: "QA Bad", name: " ", linkedin: "http://x.example", image: "https://x.example/p.jpg", sortOrder: -1, isActiveHod: true } });
  check("D5 invalid create → 400 with field errors id, name, designation, linkedin, image, sortOrder, isActiveHod", bad.status === 400 && ["id", "name", "designation", "linkedin", "image", "sortOrder", "isActiveHod"].every((k) => bad.json?.errors?.[k]), bad.json);
  const up = await call("PATCH", "/api/admin/faculty/qa-api-b", { ...T, body: { designation: "QA updated", linkedin: "https://example.org/qa", quote: "QA quote" } });
  check("D6 update → 200 with mapped fields", up.status === 200 && up.json.data.designation === "QA updated" && up.json.data.linkedin === "https://example.org/qa" && up.json.data.quote === "QA quote", up.json);
  check("D7 changing the id → 400 errors.id", (await call("PATCH", "/api/admin/faculty/qa-api-b", { ...T, body: { id: "qa-api-z" } })).json?.errors?.id !== undefined);
  check("D8 empty update → 400 errors.form", (await call("PATCH", "/api/admin/faculty/qa-api-b", { ...T, body: {} })).json?.errors?.form !== undefined);
  check("D9 update of a missing record → 404", (await call("PATCH", "/api/admin/faculty/qa-api-missing", { ...T, body: { name: "x" } })).status === 404);
  check("D10 malformed id in the path → 404", (await call("PATCH", "/api/admin/faculty/Bad%20Id", { ...T, body: { name: "x" } })).status === 404);

  section("E. HOD (admin)");
  const hu = await call("POST", "/api/admin/hod", { ...T, body: { facultyId: "qa-api-b" } });
  check("E1 unpublished record cannot become HOD → 409", hu.status === 409, hu.json);
  check("E2 unknown record → 404", (await call("POST", "/api/admin/hod", { ...T, body: { facultyId: "qa-api-missing" } })).status === 404);
  check("E3 bad body → 400 errors.facultyId", (await call("POST", "/api/admin/hod", { ...T, body: { facultyId: 7 } })).json?.errors?.facultyId !== undefined);
  // Never touch a real HOD: setting qa-api-a as HOD would switch it away (and archive its published message).
  const realHod = ((await call("GET", "/api/admin/faculty", T)).json?.data ?? []).find((r) => r.isActiveHod && !r.id.startsWith("qa-"));
  if (realHod) {
    for (const n of ["E4", "E5", "E6", "F1–F17 HOD message workflow", "R1"]) check(`${n} (NOT RUN: staging has a real active HOD, ${realHod.id}; tests never switch or clear it)`, false);
  } else {
  const set = await call("POST", "/api/admin/hod", { ...T, body: { facultyId: "qa-api-a" } });
  const afterSet = (await call("GET", "/api/admin/faculty", T)).json?.data?.filter((r) => r.isActiveHod).map((r) => r.id);
  check("E4 set HOD → 200 and exactly one active HOD", set.status === 200 && JSON.stringify(afterSet) === '["qa-api-a"]', { status: set.status, afterSet });
  check("E5 deleting the active HOD → 409", (await call("DELETE", "/api/admin/faculty/qa-api-a", T)).status === 409);
  check("E6 unpublishing the active HOD → 409", (await call("PATCH", "/api/admin/faculty/qa-api-a", { ...T, body: { isPublished: false } })).status === 409);

  section("F. HOD messages (admin) — workflow draft → approved → published → archived");
  const m1 = await call("POST", "/api/admin/hod-messages", { ...T, body: { facultyId: "qa-api-a", message: "QA API draft" } });
  check("F1 create draft → 201", m1.status === 201 && m1.json.data.status === "draft", m1.json);
  const mid = m1.json?.data?.id;
  const born = await call("POST", "/api/admin/hod-messages", { ...T, body: { facultyId: "qa-api-a", message: "QA born approved", status: "approved", approvedBy: "QA", approvedOn: "2026-11-01" } });
  check("F1b a new message can't start approved or published (drafts only) → 400 errors.status", born.status === 400 && !!born.json?.errors?.status, born.json);
  const pubDirect = await call("PATCH", `/api/admin/hod-messages/${mid}`, { ...T, body: { status: "published", approvedBy: "QA approver", approvedOn: "2026-11-01" } });
  check("F2 publishing a draft directly (even with approval fields) → 400 errors.status: approve first", pubDirect.status === 400 && !!pubDirect.json?.errors?.status, pubDirect.json);
  const noApprover = await call("PATCH", `/api/admin/hod-messages/${mid}`, { ...T, body: { status: "approved" } });
  check("F2b approving without approver and date → 400 errors.approvedBy", noApprover.status === 400 && !!noApprover.json?.errors?.approvedBy, noApprover.json);
  check("F8 bad date → 400 errors.approvedOn", (await call("PATCH", `/api/admin/hod-messages/${mid}`, { ...T, body: { status: "approved", approvedBy: "QA approver", approvedOn: "01/11/2026" } })).json?.errors?.approvedOn !== undefined);
  const feb30 = await call("PATCH", `/api/admin/hod-messages/${mid}`, { ...T, body: { status: "approved", approvedBy: "QA approver", approvedOn: "2026-02-30" } });
  check("F8b impossible calendar date 2026-02-30 → 400 errors.approvedOn (was 500)", feb30.status === 400 && !!feb30.json?.errors?.approvedOn, { status: feb30.status, body: feb30.json });
  const editDraft = await call("PATCH", `/api/admin/hod-messages/${mid}`, { ...T, body: { message: "QA API final wording" } });
  check("F2c draft wording can be edited", editDraft.status === 200 && editDraft.json.data.message === "QA API final wording", editDraft.json);
  const appr = await call("PATCH", `/api/admin/hod-messages/${mid}`, { ...T, body: { status: "approved", approvedBy: "QA approver", approvedOn: "2024-02-29" } });
  check("F8c approve with approver and a valid leap day 2024-02-29 → 200 approved", appr.status === 200 && appr.json.data.status === "approved" && appr.json.data.approvedOn === "2024-02-29", appr.json);
  check("F14 approved wording can't be edited → 400 errors.message", (await call("PATCH", `/api/admin/hod-messages/${mid}`, { ...T, body: { message: "changed" } })).json?.errors?.message !== undefined);
  check("F14b the approval record can't be rewritten → 400 errors.approvedBy", (await call("PATCH", `/api/admin/hod-messages/${mid}`, { ...T, body: { approvedBy: "someone else" } })).json?.errors?.approvedBy !== undefined);
  const pub = await call("PATCH", `/api/admin/hod-messages/${mid}`, { ...T, body: { status: "published" } });
  check("F3 publish the approved message → 200", pub.status === 200 && pub.json.data.status === "published", pub.json);
  check("F14c published wording can't be edited → 400", (await call("PATCH", `/api/admin/hod-messages/${mid}`, { ...T, body: { message: "changed" } })).status === 400);
  const m2 = (await call("POST", "/api/admin/hod-messages", { ...T, body: { facultyId: "qa-api-a", message: "QA second" } })).json?.data?.id;
  await call("PATCH", `/api/admin/hod-messages/${m2}`, { ...T, body: { status: "approved", approvedBy: "QA", approvedOn: "2026-11-01" } });
  const pub2 = await call("PATCH", `/api/admin/hod-messages/${m2}`, { ...T, body: { status: "published" } });
  check("F4 a second published message → 409 errors.status (database: one published)", pub2.status === 409 && !!pub2.json?.errors?.status, pub2.json);
  const back = await call("PATCH", `/api/admin/hod-messages/${m2}`, { ...T, body: { status: "draft" } });
  check("F17 approved → back to draft clears the approval", back.status === 200 && back.json.data.status === "draft" && back.json.data.approvedBy === null && back.json.data.approvedOn === null, back.json);
  await call("PATCH", `/api/admin/hod-messages/${m2}`, { ...T, body: { status: "archived" } });
  check("F15 archived messages are final → 409", (await call("PATCH", `/api/admin/hod-messages/${m2}`, { ...T, body: { status: "draft" } })).status === 409);
  check("F6 moving a message (facultyId) → 400", (await call("PATCH", `/api/admin/hod-messages/${mid}`, { ...T, body: { facultyId: "qa-api-b" } })).status === 400);
  check("F7 malformed message id → 404", (await call("PATCH", "/api/admin/hod-messages/not-a-uuid", { ...T, body: { message: "x" } })).status === 404);
  const ml = await call("GET", "/api/admin/hod-messages", T);
  check("F9 list messages → 200, includes approval fields for the admin", ml.status === 200 && ml.json.data.some((r) => r.id === mid && r.approvedBy === "QA approver"), ml.status);
  const m3 = (await call("POST", "/api/admin/hod-messages", { ...T, body: { facultyId: "qa-api-a", message: "QA third" } })).json?.data?.id;
  await call("PATCH", `/api/admin/hod-messages/${m3}`, { ...T, body: { status: "approved", approvedBy: "QA", approvedOn: "2026-11-01" } });
  const cleared = await call("DELETE", "/api/admin/hod", T);
  const archived = (await call("GET", "/api/admin/hod-messages", T)).json?.data?.find((r) => r.id === mid)?.status;
  check("F10 clearing the HOD → 200 and the published message is archived", cleared.status === 200 && archived === "archived", { status: cleared.status, archived });
  const notHod = await call("PATCH", `/api/admin/hod-messages/${m3}`, { ...T, body: { status: "published" } });
  check("F5 publishing for a faculty record that isn't the active HOD → 409 (database rule)", notHod.status === 409, notHod.json);
  await call("PATCH", `/api/admin/hod-messages/${m3}`, { ...T, body: { status: "archived" } });
  check("F11 deleting faculty with message history → 409 (D2)", (await call("DELETE", "/api/admin/faculty/qa-api-a", T)).status === 409);
  const delB = await call("DELETE", "/api/admin/faculty/qa-api-b", T);
  check("F12 deleting faculty without history → 204", delB.status === 204);
  check("F13 deleting it again → 404", (await call("DELETE", "/api/admin/faculty/qa-api-b", T)).status === 404);

  // restore a neutral state (records with message history stay, unpublished)
  await call("DELETE", "/api/admin/hod", T);
  await call("PATCH", "/api/admin/faculty/qa-api-a", { ...T, body: { isPublished: false } });
  const left = (await call("GET", "/api/admin/faculty", T)).json?.data ?? [];
  check("R1 no active HOD and no published qa-api- records left", !left.some((r) => r.isActiveHod) && !left.some((r) => r.id.startsWith("qa-api-") && r.isPublished));
  }

  // Streamed (chunked) request, no Content-Length, ~1 MB offered → the server must stop at 32 KB. Runs LAST: the
  // server answers 413 and closes that connection mid-upload (normal HTTP), and fetch's connection pool must not
  // reuse it for another test.
  let offered = 0;
  const chunkedBody = new ReadableStream({ pull(ctl) { if (offered >= 128) return ctl.close(); offered++; ctl.enqueue(new Uint8Array(8 * 1024).fill(0x20)); } });
  const chunked = await fetch(`${BASE}/api/admin/faculty`, { method: "POST", duplex: "half", body: chunkedBody, headers: { Origin: BASE, Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" } }).catch((e) => ({ status: "fetch error: " + e.message, headers: new Headers() }));
  responses++; if (!/no-store/.test(chunked.headers.get("cache-control") ?? "")) noStoreViolations++;
  check(`C6 streamed request without Content-Length over 32 KB → 413 (${offered} of 128 chunks offered when the server stopped)`, chunked.status === 413, chunked.status);
}

section("G. response headers");
check(`G1 every handler response (${responses}) carries Cache-Control: no-store (${frameworkResponses} framework 405 response(s) excluded)`, noStoreViolations === 0 && responses > 0, { noStoreViolations, responses });
await admin.auth.signOut({ scope: "local" });

const passed = checks.filter((c) => c.ok).length;
console.log(`\n${passed}/${checks.length} checks passed (expect=${EXPECT})`);
const outDir = join(ROOT, "qa/cms-api/results");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `cms-api-${EXPECT}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`), JSON.stringify({ project: `staging (${env.ref.slice(0, 4)}…)`, base: BASE, expect: EXPECT, passed, total: checks.length, checks }, null, 1));
process.exit(passed === checks.length ? 0 : 1);
