// Read-only DATA EXPORT (not a database backup) of the Sophia CMS in sophia-cms-staging, made through the API as
// the staging test admin. It records rows, the bucket settings and photo files for reference and comparison.
// It CANNOT restore: schema, functions, triggers, policies and grants are not exported (they come from the
// migrations), and the API refuses to write back is_active_hod, timestamps, updated_by, audit rows and profiles.
// Only the admin's own profiles row is visible (RLS). For a restorable backup use pg_dump (architecture doc §19.10).
//   node qa/cms-db/backup-staging.mjs
// Output: qa/cms-db/backups/<timestamp>/ (Git-ignored) with one JSON file per table, the storage object list plus
// the objects themselves, manifest.json and SHA256SUMS.txt. A table that doesn't exist yet is recorded as "absent".
// Not included: auth users and Supabase-managed schemas (no migration or rollback script touches them).
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { loadQaEnv } from "./lib/env.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const env = loadQaEnv(ROOT);
const admin = createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } });
const s = await admin.auth.signInWithPassword({ email: env.adminEmail, password: env.adminPassword });
if (s.error) { console.error("REFUSED: staging test admin sign-in failed."); process.exit(1); }

const OUT = join(ROOT, "qa/cms-db/backups", new Date().toISOString().replace(/[:.]/g, "-"));
mkdirSync(OUT, { recursive: true });
const manifest = { project: `sophia-cms-staging (${env.ref.slice(0, 4)}…)`, at: new Date().toISOString(), tables: {}, storage: null };

async function dump(table, filter) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    let q = admin.from(table).select("*").range(from, from + 999);
    if (filter) q = filter(q);
    const r = await q;
    if (r.error) return r.error.code === "PGRST205" || r.error.code === "42P01" ? "absent" : `error ${r.error.code}`;
    rows.push(...r.data);
    if (r.data.length < 1000) break;
  }
  writeFileSync(join(OUT, `${table}.json`), JSON.stringify(rows, null, 1));
  return rows.length;
}
manifest.tables.faculty = await dump("faculty");
manifest.tables.hod_messages = await dump("hod_messages");
manifest.tables.audit_log = await dump("audit_log", (q) => q.order("id"));
manifest.tables.profiles = await dump("profiles");          // RLS: the admin's own row only

const bucket = await admin.storage.getBucket("faculty-photos");
if (bucket.error) manifest.storage = "absent";
else {
  writeFileSync(join(OUT, "bucket.json"), JSON.stringify(bucket.data, null, 1));   // public flag, size limit, MIME list
  const objects = [];
  const walk = async (prefix) => {
    const r = await admin.storage.from("faculty-photos").list(prefix, { limit: 1000 });
    for (const o of r.data ?? []) o.id === null ? await walk(`${prefix}${o.name}/`) : objects.push(`${prefix}${o.name}`);
  };
  await walk("faculty/");
  mkdirSync(join(OUT, "storage"), { recursive: true });
  for (const p of objects) {
    const d = await admin.storage.from("faculty-photos").download(p);
    if (!d.error) writeFileSync(join(OUT, "storage", p.replace(/\//g, "__")), Buffer.from(await d.data.arrayBuffer()));
  }
  writeFileSync(join(OUT, "storage-objects.json"), JSON.stringify(objects, null, 1));
  manifest.storage = { objects: objects.length };
}
await admin.auth.signOut();

writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));
const files = [];
const list = (d, rel = "") => { for (const f of readdirSync(join(OUT, rel))) { const p = join(rel, f); try { readdirSync(join(OUT, p)); list(d, p); } catch { files.push(p); } } };
list(OUT);
writeFileSync(join(OUT, "SHA256SUMS.txt"), files.sort().map((f) => `${createHash("sha256").update(readFileSync(join(OUT, f))).digest("hex")} *${f.replace(/\\/g, "/")}`).join("\n") + "\n");
console.log(JSON.stringify(manifest, null, 1));
console.log(`backup written: ${OUT}`);
