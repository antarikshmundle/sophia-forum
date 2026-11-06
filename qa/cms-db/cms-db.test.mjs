// Sophia CMS P1 database tests: run against sophia-cms-staging ONLY (enforced by lib/env.mjs).
// Uses the public (publishable/anon) key as "anon" and the staging test admin's password session as "admin".
// Never uses a secret key, never prints credentials. Test records use the "qa-" id prefix.
//   node qa/cms-db/cms-db.test.mjs
// Test data that can't be removed through the API (faculty with message history, archived messages, audit
// entries) stays in staging by design (D2, D5); supabase/tests/cleanup_qa_data.sql removes it (owner, SQL editor).
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { loadQaEnv, redact } from "./lib/env.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const env = loadQaEnv(ROOT);
const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const anon = createClient(env.url, env.key, opts);
const admin = createClient(env.url, env.key, opts);

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok: !!ok, ...(ok || detail === undefined ? {} : { detail: redact(JSON.stringify(detail), env) }) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : "  — " + redact(JSON.stringify(detail), env).slice(0, 240)}`);
  return !!ok;
};
const errOf = (r) => (r.error ? { code: r.error.code, hint: r.error.hint, message: r.error.message } : null);
const failsWith = (r, codes, hint) => !!r.error && codes.includes(r.error.code) && (!hint || r.error.hint === hint);
const section = (t) => console.log(`\n== ${t}`);

const F = (id, extra = {}) => ({ id, name: `QA ${id}`, designation: "QA designation", sort_order: 900, is_published: true, ...extra });
async function ensureFaculty(rec) {
  const ins = await admin.from("faculty").insert(rec).select("id");
  if (!ins.error) return true;
  if (ins.error.code !== "23505") return check(`setup: ensure ${rec.id}`, false, errOf(ins));
  const { id, ...rest } = rec;
  const upd = await admin.from("faculty").update(rest).eq("id", id).select("id");
  return upd.error ? check(`setup: ensure ${rec.id}`, false, errOf(upd)) : true;
}
const activeHods = async () => (await admin.from("faculty").select("id").eq("is_active_hod", true)).data?.map((r) => r.id) ?? null;

// ---------------------------------------------------------------- preflight
section("preflight");
const signIn = await admin.auth.signInWithPassword({ email: env.adminEmail, password: env.adminPassword });
if (!check("staging test admin can sign in with email + password", !signIn.error, errOf(signIn))) process.exit(1);
const adminUid = signIn.data.user.id;
const prof = await admin.from("profiles").select("role").eq("user_id", adminUid).maybeSingle();
if (!check("admin has a profiles row with role 'admin'", prof.data?.role === "admin", errOf(prof) ?? prof.data)) process.exit(1);
const tables = await Promise.all(["faculty", "hod_messages", "audit_log"].map((t) => admin.from(t).select("*", { head: true, count: "exact" }).limit(0)));
if (!check("tables faculty, hod_messages, audit_log exist", tables.every((r) => !r.error), tables.map(errOf))) process.exit(1);

// reset the qa- state left by a previous run
await admin.rpc("clear_active_hod");
const QA_IDS = ["qa-pub", "qa-unpub", "qa-hod-a", "qa-hod-b", "qa-c1", "qa-c2", "qa-c3", "qa-tmp"];
// one row at a time: a row with message history fails its own delete (FK restrict, D2) without blocking the others
const deleteQa = async () => { for (const id of QA_IDS) await admin.from("faculty").delete().eq("id", id); };
await deleteQa();
for (const id of ["qa-pub", "qa-hod-a", "qa-hod-b", "qa-c1", "qa-c2", "qa-c3"]) await ensureFaculty(F(id));
await ensureFaculty(F("qa-unpub", { is_published: false }));

// ---------------------------------------------------------------- A. public key (anon)
section("A. public key (anon role)");
const aSel = await anon.from("faculty").select("id, is_published").in("id", ["qa-pub", "qa-unpub"]);
check("A1 anon reads published faculty only", !aSel.error && aSel.data.some((r) => r.id === "qa-pub") && !aSel.data.some((r) => r.id === "qa-unpub"), errOf(aSel) ?? aSel.data);
check("A2 anon cannot insert faculty", failsWith(await anon.from("faculty").insert(F("qa-tmp")), ["42501"]));
check("A3 anon cannot update faculty", failsWith(await anon.from("faculty").update({ name: "x" }).eq("id", "qa-pub"), ["42501"]));
check("A4 anon cannot delete faculty", failsWith(await anon.from("faculty").delete().eq("id", "qa-pub"), ["42501"]));
check("A5 anon cannot read profiles", failsWith(await anon.from("profiles").select("user_id"), ["42501"]));
check("A6 anon cannot read audit_log", failsWith(await anon.from("audit_log").select("id"), ["42501"]));
const aRpc = await anon.rpc("set_active_hod", { p_faculty_id: "qa-pub" });
check("A7 anon cannot call set_active_hod", !!aRpc.error && (await activeHods())?.length === 0, errOf(aRpc));
check("A8 anon cannot call clear_active_hod", !!(await anon.rpc("clear_active_hod")).error);
check("A9 anon cannot call app_role", !!(await anon.rpc("app_role")).error);
check("A11 anon cannot read faculty.image_consent / updated_by", failsWith(await anon.from("faculty").select("image_consent").eq("id", "qa-pub"), ["42501"]) && failsWith(await anon.from("faculty").select("updated_by").eq("id", "qa-pub"), ["42501"]));
check("A12 anon cannot read hod_messages.approved_by", failsWith(await anon.from("hod_messages").select("approved_by").limit(1), ["42501"]));
check("A13 anon select * on faculty is refused (public reads must name columns)", failsWith(await anon.from("faculty").select("*").limit(1), ["42501"]));
check("A10 anon cannot insert an HOD message", failsWith(await anon.from("hod_messages").insert({ faculty_id: "qa-pub", message: "x" }), ["42501"]));

// ---------------------------------------------------------------- B. admin writes, constraints, privileges
section("B. admin writes, constraints and privileges");
const bIns = await admin.from("faculty").insert(F("qa-tmp", { is_published: false })).select("id, department, is_active_hod").single();
check("B1 admin inserts faculty; department defaults to AI & DS; not HOD", !bIns.error && bIns.data.department === "Artificial Intelligence & Data Science" && bIns.data.is_active_hod === false, errOf(bIns) ?? bIns.data);
const bUpd = await admin.from("faculty").update({ designation: "QA updated" }).eq("id", "qa-tmp").select("designation, updated_by").single();
check("B2 admin updates faculty; updated_by stamped with the admin", !bUpd.error && bUpd.data.designation === "QA updated" && bUpd.data.updated_by === adminUid, errOf(bUpd) ?? bUpd.data);
check("B3 slug rule: id 'QA Bad Id' rejected", failsWith(await admin.from("faculty").insert(F("QA Bad Id")), ["23514"]));
check("B4 LinkedIn must be https://", failsWith(await admin.from("faculty").update({ linkedin: "http://example.com/x" }).eq("id", "qa-tmp"), ["23514"]));
check("B5 photo path without consent rejected", failsWith(await admin.from("faculty").update({ image_path: "faculty/qa-tmp/00000000-0000-4000-8000-000000000000.jpg" }).eq("id", "qa-tmp"), ["23514"]));
check("B6 photo path for another record rejected", failsWith(await admin.from("faculty").update({ image_path: "faculty/qa-pub/00000000-0000-4000-8000-000000000000.jpg", image_consent: "QA" }).eq("id", "qa-tmp"), ["23514"]));
const bImg = await admin.from("faculty").update({ image_path: "faculty/qa-tmp/00000000-0000-4000-8000-000000000000.jpg", image_consent: "QA test consent" }).eq("id", "qa-tmp").select("id");
check("B7 valid photo path with consent accepted", !bImg.error && bImg.data.length === 1, errOf(bImg));
check("B8 id cannot be changed (no column grant)", failsWith(await admin.from("faculty").update({ id: "qa-renamed" }).eq("id", "qa-tmp"), ["42501"]));
check("B9 is_active_hod cannot be set directly (update)", failsWith(await admin.from("faculty").update({ is_active_hod: true }).eq("id", "qa-tmp"), ["42501"]));
check("B10 is_active_hod cannot be set directly (insert)", failsWith(await admin.from("faculty").insert(F("qa-x-hod", { is_active_hod: true })), ["42501"]));
check("B11 admin cannot change own role", failsWith(await admin.from("profiles").update({ role: "manager" }).eq("user_id", adminUid), ["42501"]));
check("B12 admin cannot insert profiles", failsWith(await admin.from("profiles").insert({ user_id: adminUid, display_name: "x", role: "admin" }), ["42501"]));
check("B13 admin cannot write audit_log", failsWith(await admin.from("audit_log").insert({ table_name: "x", record_id: "x", action: "insert" }), ["42501"]));
const bDel = await admin.from("faculty").delete().eq("id", "qa-tmp").select("id");
check("B14 admin deletes faculty without message history", !bDel.error && bDel.data.length === 1, errOf(bDel));
const bAud = await admin.from("audit_log").select("action, actor").eq("table_name", "faculty").eq("record_id", "qa-tmp").order("id", { ascending: false }).limit(10);
check("B15 audit_log recorded insert, update and delete of qa-tmp by the admin", !bAud.error && ["insert", "update", "delete"].every((a) => bAud.data.some((r) => r.action === a && r.actor === adminUid)), errOf(bAud) ?? bAud.data);

// ---------------------------------------------------------------- C. HOD rules
section("C. single active HOD");
check("C1 unpublished record cannot become HOD", failsWith(await admin.rpc("set_active_hod", { p_faculty_id: "qa-unpub" }), ["P0001"], "sophia:hod_unpublished"));
check("C2 unknown record cannot become HOD", failsWith(await admin.rpc("set_active_hod", { p_faculty_id: "qa-does-not-exist" }), ["P0002"], "sophia:not_found"));
const c3 = await admin.rpc("set_active_hod", { p_faculty_id: "qa-hod-a" });
check("C3 set_active_hod(qa-hod-a) → exactly one active HOD", !c3.error && JSON.stringify(await activeHods()) === '["qa-hod-a"]', errOf(c3));
const c4 = await admin.rpc("set_active_hod", { p_faculty_id: "qa-hod-b" });
check("C4 switching to qa-hod-b clears qa-hod-a", !c4.error && JSON.stringify(await activeHods()) === '["qa-hod-b"]', errOf(c4));
check("C5 the active HOD cannot be deleted", failsWith(await admin.from("faculty").delete().eq("id", "qa-hod-b"), ["P0001"], "sophia:active_hod_delete"));
check("C6 the active HOD cannot be unpublished", failsWith(await admin.from("faculty").update({ is_published: false }).eq("id", "qa-hod-b"), ["P0001"], "sophia:active_hod_unpublish"));
const c7 = await admin.rpc("clear_active_hod");
check("C7 clear_active_hod leaves no active HOD", !c7.error && (await activeHods())?.length === 0, errOf(c7));

// ---------------------------------------------------------------- D. genuine concurrency
section("D. concurrent set_active_hod() calls");
const CANDIDATES = ["qa-c1", "qa-c2", "qa-c3"];
const ROUNDS = 5, PER_ROUND = 24;
let allOk = true, maxInFlight = 0, overlapping = 0;
for (let round = 1; round <= ROUNDS; round++) {
  let inFlight = 0;
  const spans = [];
  const calls = Array.from({ length: PER_ROUND }, async (_, i) => {
    inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
    const t0 = performance.now();
    const r = await admin.rpc("set_active_hod", { p_faculty_id: CANDIDATES[(i + round) % CANDIDATES.length] });
    spans.push([t0, performance.now()]); inFlight--;
    return r;
  });
  const res = await Promise.all(calls);
  const errors = res.filter((r) => r.error).map(errOf);
  const active = await activeHods();
  overlapping += spans.filter(([s], i) => spans.some(([s2, e2], j) => j !== i && s2 < s && s < e2)).length;
  const ok = errors.length === 0 && active?.length === 1 && CANDIDATES.includes(active[0]);
  allOk &&= ok;
  check(`D${round} round ${round}: ${PER_ROUND} parallel calls → all succeed, exactly one active HOD`, ok, { errors: errors.slice(0, 3), active });
}
// Client-side evidence only: the API can't show database locks. The database-level proof (waiters observed in
// pg_locks, plus a no-lock negative control) is the disposable-PostgreSQL validation recorded in §19.9.
check(`D6 requests were in flight simultaneously (client-side: max ${maxInFlight} in flight; ${overlapping} of ${ROUNDS * PER_ROUND} started while another was running)`, maxInFlight >= 2 && overlapping > 0);
const mixed = await Promise.all(Array.from({ length: PER_ROUND }, (_, i) => (i % 4 === 0 ? admin.rpc("clear_active_hod") : admin.rpc("set_active_hod", { p_faculty_id: CANDIDATES[i % 3] }))));
const mixedActive = await activeHods();
check("D7 mixed parallel set/clear calls → never more than one active HOD", mixed.every((r) => !r.error) && Array.isArray(mixedActive) && mixedActive.length <= 1, { errors: mixed.filter((r) => r.error).map(errOf).slice(0, 3), mixedActive });

// ---------------------------------------------------------------- E. HOD messages
section("E. HOD messages");
await admin.rpc("set_active_hod", { p_faculty_id: "qa-hod-a" });
const e1 = await admin.from("hod_messages").insert({ faculty_id: "qa-hod-a", message: "QA draft message" }).select("id, status").single();
check("E1 admin creates a draft message", !e1.error && e1.data.status === "draft", errOf(e1));
const msgA = e1.data?.id;
check("E2 publishing without approval is rejected", failsWith(await admin.from("hod_messages").update({ status: "published" }).eq("id", msgA), ["23514"]));
const e3 = await admin.from("hod_messages").update({ status: "published", approved_by: "QA approver", approved_on: "2026-11-01" }).eq("id", msgA).select("status").single();
check("E3 publishing with approval succeeds for the active HOD", !e3.error && e3.data.status === "published", errOf(e3));
const e4 = await anon.from("hod_messages").select("id").eq("id", msgA);
check("E4 anon can read the published message", !e4.error && e4.data.length === 1, errOf(e4));
const second = await admin.from("hod_messages").insert({ faculty_id: "qa-hod-a", message: "QA second", status: "published", approved_by: "QA", approved_on: "2026-11-01" });
check("E5 a second published message is rejected", failsWith(second, ["23505"]));
check("E6 a message of a non-active HOD cannot be published", failsWith(await admin.from("hod_messages").insert({ faculty_id: "qa-hod-b", message: "QA other", status: "published", approved_by: "QA", approved_on: "2026-11-01" }), ["P0001"], "sophia:publish_not_active_hod"));
await admin.rpc("set_active_hod", { p_faculty_id: "qa-hod-b" });
const e7 = await admin.from("hod_messages").select("status").eq("id", msgA).single();
const e7anon = await anon.from("hod_messages").select("id").eq("id", msgA);
check("E7 switching HOD archives the previous HOD's published message", e7.data?.status === "archived" && e7anon.data?.length === 0, errOf(e7) ?? e7.data);
check("E8 messages cannot be deleted (archived, never deleted)", failsWith(await admin.from("hod_messages").delete().eq("id", msgA), ["42501"]));
check("E9 a message cannot be moved to another faculty record", failsWith(await admin.from("hod_messages").update({ faculty_id: "qa-hod-b" }).eq("id", msgA), ["42501"]));
await admin.rpc("clear_active_hod");
check("E10 D2: faculty with message history cannot be deleted", failsWith(await admin.from("faculty").delete().eq("id", "qa-hod-a"), ["23503"]));
const eAud = await admin.from("audit_log").select("action").eq("table_name", "hod_messages").eq("record_id", msgA);
check("E11 audit_log recorded the message's insert and updates", !eAud.error && eAud.data.some((r) => r.action === "insert") && eAud.data.filter((r) => r.action === "update").length >= 2, errOf(eAud));

// ---------------------------------------------------------------- restore a neutral staging state
section("restore");
await admin.rpc("clear_active_hod");
for (const id of QA_IDS) await admin.from("faculty").update({ is_published: false }).eq("id", id);
await deleteQa();
const left = (await admin.from("faculty").select("id").like("id", "qa-%")).data?.map((r) => r.id) ?? [];
check("R1 no active HOD and no published qa- records left", (await activeHods())?.length === 0 && !(await anon.from("faculty").select("id").like("id", "qa-%")).data?.length);
console.log(`   qa- records kept because they have message history (D2): ${left.join(", ") || "none"}`);
await admin.auth.signOut();

const passed = checks.filter((c) => c.ok).length;
console.log(`\n${passed}/${checks.length} checks passed`);
const out = join(ROOT, "qa/cms-db/results");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, `cms-db-${new Date().toISOString().replace(/[:.]/g, "-")}.json`), JSON.stringify({ project: `staging (${env.ref.slice(0, 4)}…)`, at: new Date().toISOString(), passed, total: checks.length, checks }, null, 1));
process.exit(passed === checks.length ? 0 : 1);
