// Imports the SOPHIA FORUM committee 2026-27 (31 members, owner's "MEET THE FORUM TEAM - 2026-27" deck,
// PPT _compressed.pdf, slides 2–32) into Team on sophia-cms-staging, through the Admin API (same validation as the form).
// Name and role only: no photos (the cards show initials), biographies, quotes, skills or links.
// Never updates or deletes an existing record: an existing record with the same person's name, or a similar name,
// or the same id stops the import (reported as ambiguous). Records are added unpublished, verified as a set, and only
// then published (--apply), so a partial import is never public. Category mapping approved by the owner 2026-11-04;
// corrected the same day: order = the deck's slide order (fix-committee-order-2026.mjs), the Chief Head Secretary stays
// in Secretary (/team shows him beside the President by role), and the finance, discipline, Women Cell, NSS and
// Sponsorship roles use the categories added by supabase/migrations/20261104000001_team_committee_categories.sql
// (recategorise-committee-2026.mjs moved the existing records).
//   node qa/cms-db/import-committee-2026.mjs --base http://localhost:3000            (dry run, read only)
//   node qa/cms-db/import-committee-2026.mjs --base http://localhost:3000 --apply    (server with CMS_FACULTY_MODE=backend)
import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadQaEnv } from "./lib/env.mjs";
import { loadCommitteeData } from "./lib/committee-data.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const APPLY = process.argv.includes("--apply");
const i = process.argv.indexOf("--base");
const BASE = (i > 0 ? process.argv[i + 1] : "http://localhost:3000").replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE)) { console.error("REFUSED: --base must be a local server."); process.exit(2); }

// [slide, name as printed, role as printed, display name, display role, category (existing Team categories), section]
// Display text = the printed text with only the letter case changed (checked below). The roster is personal data and
// is read from the Git-ignored local-private/committee-data.json (qa/cms-db/lib/committee-data.mjs).
const ROSTER = loadCommitteeData(ROOT).importRoster;

const TITLES = /^(mr|mrs|ms|miss|dr|prof)\.?\s+/;
const person = (n) => n.toLowerCase().replace(/\s+/g, " ").trim().replace(TITLES, "").replace(/[^a-z ]/g, "");
const slug = (n) => `committee-2026-${person(n).replace(/ /g, "-")}`;

// ---- roster self-check: 31 members, slides 2–32 once each, display text = printed text (case only), unique people
const problems = [];
if (ROSTER.length !== 31) problems.push(`roster has ${ROSTER.length} entries, expected 31`);
const slides = ROSTER.map((r) => r[0]).sort((a, b) => a - b);
if (slides.join() !== Array.from({ length: 31 }, (_, k) => k + 2).join()) problems.push(`slides are not exactly 2–32: ${slides.join()}`);
for (const [slide, pn, pr, name, role] of ROSTER) {
  if (name.toUpperCase() !== pn) problems.push(`slide ${slide}: name "${name}" differs from printed "${pn}"`);
  if (role.toUpperCase() !== pr) problems.push(`slide ${slide}: role "${role}" differs from printed "${pr}"`);
}
if (new Set(ROSTER.map((r) => person(r[3]))).size !== 31) problems.push("two roster entries are the same person");
if (problems.length) { console.error("ROSTER CHECK FAILED:\n  " + problems.join("\n  ")); process.exit(1); }

const records = [...ROSTER].sort((a, b) => a[0] - b[0]).map(([slide, , , name, role, category, section]) => ({
  slide, section,
  body: { id: slug(name), name, role, category, sortOrder: slide - 1, skills: [], isCreatorBadge: false, isPublished: false },
}));

const env = loadQaEnv(ROOT);
const c = createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } });
const s = await c.auth.signInWithPassword({ email: env.adminEmail, password: env.adminPassword });
if (s.error) { console.error("admin sign-in failed:", s.error.code); process.exit(1); }
const H = { Authorization: `Bearer ${s.data.session.access_token}`, "Content-Type": "application/json" };
const api = async (method, path, body) => { const r = await fetch(BASE + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => null) }; };

try {
  const list = await api("GET", "/api/admin/team");
  if (list.status !== 200) throw new Error(`team list ${list.status} (is the server running with CMS_FACULTY_MODE=backend?)`);
  const existing = list.json.data;
  console.log(`existing Team records: ${existing.length}`);
  for (const m of existing) console.log(`  ${m.id} | ${m.name} | ${m.role} | ${m.category} | #${m.sortOrder} | ${m.isPublished ? "published" : "unpublished"}`);

  // ---- matching: same person (title, case, spacing, punctuation ignored), same id, or a shared surname+first-initial
  const tokens = (n) => person(n).split(" ").filter(Boolean);
  const similar = (a, b) => { const x = tokens(a), y = tokens(b); return x.length > 1 && y.length > 1 && x.at(-1) === y.at(-1) && x[0][0] === y[0][0]; };
  const plan = records.map((r) => {
    const same = existing.filter((m) => person(m.name) === person(r.body.name));
    const idClash = existing.filter((m) => m.id === r.body.id && !same.includes(m));
    const near = existing.filter((m) => !same.includes(m) && !idClash.includes(m) && similar(m.name, r.body.name));
    const exact = same.length === 1 && same[0].role === r.body.role && same[0].category === r.body.category;
    const status = same.length === 0 && idClash.length === 0 && near.length === 0 ? "NEW"
      : exact && idClash.length === 0 && near.length === 0 ? "EXISTS (identical name, role and category; not touched)"
      : "AMBIGUOUS";
    return { ...r, status, same, idClash, near };
  });

  console.log("\nplan (in display order):");
  for (const p of plan) {
    console.log(`  #${String(p.body.sortOrder).padStart(2)} slide ${String(p.slide).padStart(2)} | ${p.body.name} | ${p.body.role} | ${p.section} → ${p.body.category} | ${p.body.id} | ${p.status}`);
    for (const m of [...p.same, ...p.idClash, ...p.near]) console.log(`        matches existing ${m.id}: ${m.name}, ${m.role}, ${m.category}, ${m.isPublished ? "published" : "unpublished"}`);
  }
  const ambiguous = plan.filter((p) => p.status === "AMBIGUOUS");
  const toAdd = plan.filter((p) => p.status === "NEW");
  console.log(`\nsummary: ${toAdd.length} new, ${plan.length - toAdd.length - ambiguous.length} already present, ${ambiguous.length} ambiguous`);
  if (!APPLY) { console.log("dry run: nothing written. With --apply all new records are added unpublished, verified, then published."); process.exit(0); }
  if (ambiguous.length) throw new Error(`REFUSED: ${ambiguous.length} ambiguous match(es); resolve them first (nothing written).`);

  // ---- 1. add unpublished
  for (const p of toAdd) {
    const r = await api("POST", "/api/admin/team", p.body);
    if (r.status !== 201) throw new Error(`add ${p.body.id}: ${r.status} ${JSON.stringify(r.json)}`);
    console.log(`added (unpublished) ${p.body.id}`);
  }
  // ---- 2. verify the complete set before anything is published
  const after = (await api("GET", "/api/admin/team")).json.data;
  const bad = plan.filter((p) => { const m = after.find((x) => x.id === p.body.id) ?? p.same[0]; return !m || m.name !== p.body.name || m.role !== p.body.role || m.category !== p.body.category || (p.status === "NEW" && (m.sortOrder !== p.body.sortOrder || m.photo || m.bio || m.quote)); });
  if (bad.length) throw new Error(`verification failed for ${bad.map((p) => p.body.id).join(", ")} — nothing published`);
  if (after.length !== existing.length + toAdd.length) throw new Error(`count ${after.length}, expected ${existing.length + toAdd.length} — nothing published`);
  console.log(`verified all ${plan.length} committee records (team total ${after.length})`);
  // ---- 3. publish
  for (const p of toAdd) {
    const r = await api("PATCH", `/api/admin/team/${p.body.id}`, { isPublished: true });
    if (r.status !== 200 || !r.json?.data?.isPublished) throw new Error(`publish ${p.body.id}: ${r.status} ${JSON.stringify(r.json)}`);
  }
  console.log(`published ${toAdd.length}`);
} finally { await c.auth.signOut({ scope: "local" }); }
