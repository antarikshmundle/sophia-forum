// Adds the 16 verified AI & DS faculty (official PCE faculty page; source extract archived with the migration records: sophia-forum-archive-2026-11-05/qa/sophia-plan/sources/pce-official-extract.md §7)
// to sophia-cms-staging as UNPUBLISHED records, for the owner to review and publish in the Faculty Manager once
// the department confirms the list (C12). Names and designations are verbatim; no photos, quotes or links.
// Never updates or deletes anything: records whose id already exists are skipped.
//   node qa/cms-db/seed-verified-faculty.mjs                                  (dry run: prints what would be added)
//   node qa/cms-db/seed-verified-faculty.mjs --apply --base http://localhost:3010   (server with CMS_FACULTY_MODE=backend)
import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadQaEnv } from "./lib/env.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const APPLY = process.argv.includes("--apply");
const i = process.argv.indexOf("--base");
const BASE = (i > 0 ? process.argv[i + 1] : "http://localhost:3010").replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE)) { console.error("REFUSED: --base must be a local server."); process.exit(2); }

const VERIFIED = [
  ["Dr. G. M. Asutkar", "Vice Principal & Professor"],
  ["Dr.(Mrs.) S. S. Golait", "Assistant Professor & HOD"],
  ["Dr. A. C. Kailuke", "Assistant Professor"],
  ["Dr. U. P. Akare", "Assistant Professor"],
  ["Mrs. S. H. Jawale", "Assistant Professor"],
  ["Mrs. Umme Ayeman S. Gani", "Assistant Professor"],
  ["Ms. P. Meshram", "Assistant Professor"],
  ["Mrs. B. U. Pardhi", "Assistant Professor"],
  ["Mrs. Pranali Warhade", "Assistant Professor"],
  ["Ms. Heena B. Kachhela", "Assistant Professor"],
  ["Ms. Sneha R Bhange", "Assistant Professor"],
  ["Ms. M. Bhaisare", "Assistant Professor"],
  ["Mr. Sahil Ramteke", "Assistant Professor"],
  ["Mrs. Sangita Chavan", "Assistant Professor"],
  ["Mrs. Shiwani Sarode", "Assistant Professor"],
  ["Mrs. Aditi Agrawal", "Assistant Professor"],
];
const slug = (s) => s.toLowerCase().replace(/\(mrs\.\)/g, "").normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const records = VERIFIED.map(([name, designation], n) => ({
  id: slug(name), name, designation, department: "Artificial Intelligence & Data Science", sortOrder: n + 1, isPublished: false,
}));
if (new Set(records.map((r) => r.id)).size !== records.length) { console.error("duplicate ids"); process.exit(1); }

const env = loadQaEnv(ROOT);
const c = createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } });
const s = await c.auth.signInWithPassword({ email: env.adminEmail, password: env.adminPassword });
if (s.error) { console.error("admin sign-in failed:", s.error.code); process.exit(1); }
const H = { Authorization: `Bearer ${s.data.session.access_token}`, "Content-Type": "application/json" };
try {
  const list = await fetch(`${BASE}/api/admin/faculty`, { headers: H });
  if (list.status !== 200) throw new Error(`list ${list.status} (is the server running with CMS_FACULTY_MODE=backend?)`);
  const existing = new Set((await list.json()).data.map((f) => f.id));
  let added = 0, skipped = 0;
  for (const r of records) {
    if (existing.has(r.id)) { console.log(`skip   ${r.id} (exists)`); skipped++; continue; }
    if (!APPLY) { console.log(`would add ${r.id} — ${r.name}, ${r.designation} (#${r.sortOrder}, unpublished)`); continue; }
    const res = await fetch(`${BASE}/api/admin/faculty`, { method: "POST", headers: H, body: JSON.stringify(r) });
    if (res.status !== 201) throw new Error(`${r.id}: ${res.status} ${JSON.stringify(await res.json().catch(() => null))}`);
    console.log(`added  ${r.id} — ${r.name} (unpublished)`); added++;
  }
  console.log(`\n${APPLY ? `added ${added}` : `dry run: ${records.length - skipped} to add`}, skipped ${skipped}`);
} finally { await c.auth.signOut({ scope: "local" }); }
