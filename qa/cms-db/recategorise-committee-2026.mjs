// Moves 9 committee 2026-27 records to the categories added by the held migration
// supabase/migrations/20261104000001_team_committee_categories.sql (owner request 2026-11-04). Run only after that migration
// is applied. Changes only `category`, through the Admin API; names, roles, sort order and publish state stay as they
// are. Never adds, deletes or unpublishes: it refuses unless exactly the 31 imported published records exist and each
// of the 9 is in its expected current category (or already moved).
//   node qa/cms-db/recategorise-committee-2026.mjs --base http://localhost:3010                    (dry run, read only)
//   node qa/cms-db/recategorise-committee-2026.mjs --base http://localhost:3010 --apply            (server with CMS_FACULTY_MODE=backend)
//   node qa/cms-db/recategorise-committee-2026.mjs --base http://localhost:3010 --revert [--apply] (back to the old categories)
import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadQaEnv } from "./lib/env.mjs";
import { loadCommitteeData } from "./lib/committee-data.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const APPLY = process.argv.includes("--apply");
const REVERT = process.argv.includes("--revert");
const i = process.argv.indexOf("--base");
const BASE = (i > 0 ? process.argv[i + 1] : "http://localhost:3010").replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE)) { console.error("REFUSED: --base must be a local server."); process.exit(2); }

// [id, role (must match), current category, new category]. Personal data: read from the Git-ignored
// local-private/committee-data.json (qa/cms-db/lib/committee-data.mjs).
const MOVES = loadCommitteeData(ROOT).recategorise.map(([id, role, from, to]) => ({ id: `committee-2026-${id}`, role, ...(REVERT ? { from: to, to: from } : { from, to }) }));

const env = loadQaEnv(ROOT);
const c = createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } });
const s = await c.auth.signInWithPassword({ email: env.adminEmail, password: env.adminPassword });
if (s.error) { console.error("admin sign-in failed:", s.error.code); process.exit(1); }
const H = { Authorization: `Bearer ${s.data.session.access_token}`, "Content-Type": "application/json" };
const api = async (method, path, body) => { const r = await fetch(BASE + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => null) }; };
const listTeam = async () => { const r = await api("GET", "/api/admin/team"); if (r.status !== 200) throw new Error(`team list ${r.status}`); return r.json.data; };

try {
  const before = await listTeam();
  const committee = before.filter((m) => m.id.startsWith("committee-2026-"));
  if (committee.length !== 31 || committee.some((m) => !m.isPublished)) throw new Error(`REFUSED: expected the 31 imported published records; found ${committee.length}`);
  const problems = [], changes = [];
  for (const mv of MOVES) {
    const m = committee.find((r) => r.id === mv.id);
    if (!m || m.role !== mv.role) { problems.push(`${mv.id}: missing or role changed (${m?.role})`); continue; }
    if (m.category === mv.to) continue;
    if (m.category !== mv.from) { problems.push(`${mv.id}: category "${m.category}", expected "${mv.from}"`); continue; }
    changes.push(mv);
  }
  if (problems.length) throw new Error(`REFUSED (nothing written):\n  ${problems.join("\n  ")}`);
  console.log(`${REVERT ? "revert" : "recategorise"}: ${changes.length} change(s), ${MOVES.length - changes.length} already done`);
  for (const x of changes) console.log(`  ${x.id} (${x.role}): ${x.from} → ${x.to}`);
  if (!APPLY) { console.log("dry run: nothing written."); process.exit(0); }

  for (const x of changes) {
    const r = await api("PATCH", `/api/admin/team/${x.id}`, { category: x.to });
    if (r.status !== 200) throw new Error(`${x.id}: ${r.status} ${JSON.stringify(r.json)} (is the category migration applied?)`);
  }
  const after = await listTeam();
  const wrong = after.filter((m) => m.id.startsWith("committee-2026-")).filter((m) => {
    const b = before.find((r) => r.id === m.id), mv = MOVES.find((x) => x.id === m.id);
    return m.category !== (mv ? mv.to : b.category) || m.name !== b.name || m.role !== b.role || m.sortOrder !== b.sortOrder || !m.isPublished;
  });
  if (after.length !== before.length || wrong.length) throw new Error(`verification failed: count ${before.length} → ${after.length}; wrong: ${wrong.map((m) => m.id).join(", ")}`);
  console.log(`applied ${changes.length}; verified all 31 (categories, names, roles, order, publish state); team total ${after.length}`);
} finally { await c.auth.signOut({ scope: "local" }); }
