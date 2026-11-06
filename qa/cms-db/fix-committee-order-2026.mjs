// Corrects the committee 2026-27 records added by import-committee-2026.mjs (owner request 2026-11-04):
//   - sort order = the deck's slide order (slide 2 → 1 … slide 32 → 31); the import had moved the Discipline roles
//     ahead of Cultural and Sports;
//   - the Chief Head Secretary's category is Secretary. (A first run moved it to President to place him in the top
//     leadership area; the owner reverted that the same day: /team now finds the top leaders by role, and this run
//     restores Secretary.)
// Changes only sortOrder and that one category, through the Admin API. Never adds, deletes, unpublishes or renames:
// it refuses unless exactly the 31 imported records exist, published, with their imported names.
//   node qa/cms-db/fix-committee-order-2026.mjs --base http://localhost:3010            (dry run, read only)
//   node qa/cms-db/fix-committee-order-2026.mjs --base http://localhost:3010 --apply    (server with CMS_FACULTY_MODE=backend)
import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadQaEnv } from "./lib/env.mjs";
import { loadCommitteeData } from "./lib/committee-data.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const APPLY = process.argv.includes("--apply");
const i = process.argv.indexOf("--base");
const BASE = (i > 0 ? process.argv[i + 1] : "http://localhost:3010").replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE)) { console.error("REFUSED: --base must be a local server."); process.exit(2); }

// slides 2–32 in order: [id, name]. Personal data: read from the Git-ignored local-private/committee-data.json
// (qa/cms-db/lib/committee-data.mjs).
const DATA = loadCommitteeData(ROOT);
const SLIDES = DATA.slideOrder.map(([id, name], k) => ({ id: `committee-2026-${id}`, name, sortOrder: k + 1 }));
const CATEGORY_CHANGE = { id: `committee-2026-${DATA.categoryChange.idSuffix}`, from: DATA.categoryChange.from, to: DATA.categoryChange.to };

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
  const missing = SLIDES.filter((x) => !committee.some((m) => m.id === x.id && m.name === x.name && m.isPublished));
  if (committee.length !== 31 || missing.length) throw new Error(`REFUSED: expected the 31 imported published records; ${committee.length} found, missing/changed: ${missing.map((x) => x.id).join(", ") || "none"}`);
  const chs = committee.find((m) => m.id === CATEGORY_CHANGE.id);
  if (chs.category !== CATEGORY_CHANGE.from && chs.category !== CATEGORY_CHANGE.to) throw new Error(`REFUSED: ${chs.id} has category "${chs.category}"`);

  const changes = SLIDES.map((x) => {
    const m = committee.find((r) => r.id === x.id);
    const patch = {};
    if (m.sortOrder !== x.sortOrder) patch.sortOrder = x.sortOrder;
    if (x.id === CATEGORY_CHANGE.id && m.category !== CATEGORY_CHANGE.to) patch.category = CATEGORY_CHANGE.to;
    return { ...x, from: { sortOrder: m.sortOrder, category: m.category }, patch };
  }).filter((x) => Object.keys(x.patch).length);
  console.log(`team records: ${before.length} (committee ${committee.length}); changes: ${changes.length}`);
  for (const x of changes) console.log(`  ${x.id}: ${Object.entries(x.patch).map(([k, v]) => `${k} ${x.from[k]} → ${v}`).join(", ")}`);
  if (!APPLY) { console.log("dry run: nothing written."); process.exit(0); }

  for (const x of changes) {
    const r = await api("PATCH", `/api/admin/team/${x.id}`, x.patch);
    if (r.status !== 200) throw new Error(`${x.id}: ${r.status} ${JSON.stringify(r.json)}`);
  }
  const after = await listTeam();
  const wrong = SLIDES.filter((x) => { const m = after.find((r) => r.id === x.id); const b = before.find((r) => r.id === x.id);
    return !m || m.sortOrder !== x.sortOrder || !m.isPublished || m.name !== b.name || m.role !== b.role
      || m.category !== (x.id === CATEGORY_CHANGE.id ? CATEGORY_CHANGE.to : b.category); });
  if (after.length !== before.length || wrong.length) throw new Error(`verification failed: count ${before.length} → ${after.length}; wrong: ${wrong.map((x) => x.id).join(", ")}`);
  console.log(`applied ${changes.length} change(s); verified all 31 (order, publish state, names, roles, categories); team total ${after.length}`);
} finally { await c.auth.signOut({ scope: "local" }); }
