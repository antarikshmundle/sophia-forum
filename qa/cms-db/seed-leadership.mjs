// Adds the three institutional leadership profiles (About page) to sophia-cms-staging as UNPUBLISHED faculty records with
// reserved ids (leadership-*), for the owner to add photos and publish in Admin → Faculty → Institutional leadership.
// Names and designations exactly as supplied by the owner (2026-11-02); Dr. G. M. Asutkar also appears on the official
// PCE AI & DS faculty page (source extract archived with the migration records: sophia-forum-archive-2026-11-05/qa/sophia-plan/sources/pce-official-extract.md §7). No photos, biographies or quotes.
// Never updates or deletes anything: records whose id already exists are skipped.
//   node qa/cms-db/seed-leadership.mjs                                     (dry run)
//   node qa/cms-db/seed-leadership.mjs --apply --base http://localhost:3010  (server with CMS_FACULTY_MODE=backend)
import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadQaEnv } from "./lib/env.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const APPLY = process.argv.includes("--apply");
const i = process.argv.indexOf("--base");
const BASE = (i > 0 ? process.argv[i + 1] : "http://localhost:3010").replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE)) { console.error("REFUSED: --base must be a local server."); process.exit(2); }

const LEADERSHIP = [
  { id: "leadership-principal", name: "Dr. S. A. Dhale", designation: "Principal", sortOrder: 1 },
  { id: "leadership-vice-principal", name: "Dr. G. M. Asutkar", designation: "Vice Principal", sortOrder: 2 },
  { id: "leadership-student-dean", name: "Dr. V. K. Taksande", designation: "Student Dean Affairs", sortOrder: 3 },
].map((r) => ({ ...r, department: "Priyadarshini College of Engineering, Nagpur", isPublished: false }));

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
  for (const r of LEADERSHIP) {
    if (existing.has(r.id)) { console.log(`skip   ${r.id} (exists)`); skipped++; continue; }
    if (!APPLY) { console.log(`would add ${r.id} — ${r.name}, ${r.designation} (#${r.sortOrder}, unpublished)`); continue; }
    const res = await fetch(`${BASE}/api/admin/faculty`, { method: "POST", headers: H, body: JSON.stringify(r) });
    if (res.status !== 201) throw new Error(`${r.id}: ${res.status} ${JSON.stringify(await res.json().catch(() => null))}`);
    console.log(`added  ${r.id} — ${r.name}, ${r.designation} (unpublished)`); added++;
  }
  console.log(`\n${APPLY ? `added ${added}` : `dry run: ${LEADERSHIP.length - skipped} to add`}, skipped ${skipped}`);
} finally { await c.auth.signOut({ scope: "local" }); }
